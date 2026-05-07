import { run_turn } from '../../services/anthropic_service.js';
import Patient from '../../models/patient_model.js';
import ClientConfig from '../../models/client_config_model.js';
import Client from '../../models/client_model.js';
import { publish } from '../../core/event-bus.js';
import { CALENDAR_TOOL_DEFS, execute_calendar_tool } from './tools/calendar_tools.js';
import { PATIENT_TOOL_DEFS, execute_patient_tool } from './tools/patient_tools.js';
import { run_gap_fill } from './tools/gap_fill_tools.js';
import recepcionista_module from './index.js';

const ALL_TOOLS = [...CALENDAR_TOOL_DEFS, ...PATIENT_TOOL_DEFS];

// ── Patient helpers ──────────────────────────────────────────────────────────

// Finds or creates a patient record for this client + channel identifier.
const upsert_patient = async (client_id, { phone, instagram_id, name }) => {
  const query = phone
    ? { client_id, phone }
    : { client_id, instagram_id };

  const update = { $setOnInsert: { client_id, phone, instagram_id } };
  if (name) update.$set = { name };

  return Patient.findOneAndUpdate(query, update, {
    upsert:              true,
    new:                 true,
    setDefaultsOnInsert: true,
  });
};

// Returns the last N turns of history for a channel in Anthropic message format.
const build_history = (patient, channel, max_turns = 20) => {
  const field_map = {
    whatsapp:  'whatsapp_history',
    instagram: 'instagram_history',
    telegram:  'telegram_history',
  };
  const history = patient?.[field_map[channel]] ?? [];
  return history.slice(-max_turns).map(h => ({
    role:    h.role,
    content: h.content,
  }));
};

// Appends a turn to the patient's channel history.
const save_turn = async (patient_id, channel, user_text, assistant_text) => {
  const field_map = {
    whatsapp:  'whatsapp_history',
    instagram: 'instagram_history',
    telegram:  'telegram_history',
  };
  const field = field_map[channel];
  if (!field) return;

  await Patient.findByIdAndUpdate(patient_id, {
    $push: {
      [field]: {
        $each: [
          { role: 'user',      content: user_text,      timestamp: new Date() },
          { role: 'assistant', content: assistant_text, timestamp: new Date() },
        ],
      },
    },
  });
};

// ── Professional alert helper ────────────────────────────────────────────────

const alert_professional = async (client_id, reason, patient) => {
  publish(String(client_id), {
    type:    'PATIENT_ESCALATED',
    from:    'recepcionista',
    payload: {
      reason,
      patient_name:  patient?.name ?? 'desconocido',
      patient_phone: patient?.phone ?? null,
    },
  });
};

// ── Main entry point: patient-facing conversation ────────────────────────────

/**
 * Processes an inbound message from a patient and returns the assistant reply.
 *
 * @param {object} opts
 * @param {string}  opts.client_id   - MongoDB ObjectId string
 * @param {string}  opts.channel     - 'whatsapp' | 'instagram' | 'telegram'
 * @param {string}  opts.text        - The patient's message
 * @param {string}  [opts.phone]     - Patient's WhatsApp phone (international format)
 * @param {string}  [opts.instagram_id] - Patient's Instagram sender ID
 * @param {string}  [opts.sender_name]  - Name from channel metadata
 * @returns {Promise<string>} The assistant's reply
 */
const process_patient_message = async ({ client_id, channel, text, phone, instagram_id, sender_name }) => {
  // Load client config and business data in parallel
  const [config, client] = await Promise.all([
    ClientConfig.findOne({ client_id }),
    Client.findById(client_id).select('name company'),
  ]);

  // Upsert patient
  const patient = await upsert_patient(client_id, { phone, instagram_id, name: sender_name });

  // Build system prompt from module
  const employee_cfg = config?.recepcionista ?? {};
  const system_prompt = recepcionista_module.build_system_prompt({
    business_name:  client?.company ?? client?.name ?? 'la clínica',
    employee_name:  employee_cfg.employee_name,
    services:       employee_cfg.services,
    faqs:           employee_cfg.faqs,
    schedule:       employee_cfg.schedule,
    tone:           employee_cfg.tone,
  });

  // Conversation history
  const history = build_history(patient, channel);
  const messages = [
    ...history,
    { role: 'user', content: text },
  ];

  // Tool execution context
  const tool_context = {
    client_id,
    patient,
    send_professional_alert: (reason, p) => alert_professional(client_id, reason, p),
  };

  // Execute the agentic turn
  const reply = await run_turn({
    employee:      'recepcionista',
    system:        system_prompt,
    messages,
    tools:         ALL_TOOLS,
    tool_executor: async (name, input) => {
      if (CALENDAR_TOOL_DEFS.some(t => t.name === name)) {
        return execute_calendar_tool(name, input, tool_context);
      }
      if (PATIENT_TOOL_DEFS.some(t => t.name === name)) {
        return execute_patient_tool(name, input, tool_context);
      }
      return `Unknown tool: ${name}`;
    },
  });

  // Persist the turn
  await save_turn(patient._id, channel, text, reply);

  // Publish event for other employees to react to if needed
  publish(String(client_id), {
    type:    'PATIENT_MESSAGE_PROCESSED',
    from:    'recepcionista',
    payload: { channel, patient_id: String(patient._id), patient_name: patient.name },
  });

  return reply;
};

// ── Professional-facing conversation (via Telegram) ──────────────────────────

/**
 * Processes a direct command from the professional via Telegram.
 * The professional can ask questions, give orders, or check the agenda.
 *
 * @param {object} opts
 * @param {string} opts.client_id
 * @param {string} opts.text       - The professional's message
 * @param {Array}  opts.history    - Recent Telegram history with the professional
 * @returns {Promise<string>}
 */
const process_professional_command = async ({ client_id, text, history = [] }) => {
  const [config, client] = await Promise.all([
    ClientConfig.findOne({ client_id }),
    Client.findById(client_id).select('name company'),
  ]);

  const employee_cfg = config?.recepcionista ?? {};

  const system_prompt = `${recepcionista_module.build_system_prompt({
    business_name: client?.company ?? client?.name ?? 'la clínica',
    employee_name: employee_cfg.employee_name,
    services:      employee_cfg.services,
    faqs:          employee_cfg.faqs,
    schedule:      employee_cfg.schedule,
    tone:          employee_cfg.tone,
  })}

MODO ESPECIAL: Estás hablando directamente con el profesional/dueño de la clínica, no con un paciente.
Puedes darle información detallada de la agenda, estadísticas de pacientes, y ejecutar cualquier acción que te pida.
Usa un tono profesional y conciso. El profesional es tu jefe.`;

  const messages = [
    ...history.slice(-10),
    { role: 'user', content: text },
  ];

  const tool_context = { client_id, patient: null };

  return run_turn({
    employee:      'recepcionista',
    system:        system_prompt,
    messages,
    tools:         ALL_TOOLS,
    tool_executor: async (name, input) => {
      if (CALENDAR_TOOL_DEFS.some(t => t.name === name)) {
        return execute_calendar_tool(name, input, tool_context);
      }
      if (PATIENT_TOOL_DEFS.some(t => t.name === name)) {
        return execute_patient_tool(name, input, tool_context);
      }
      return `Unknown tool: ${name}`;
    },
  });
};

export { process_patient_message, process_professional_command, run_gap_fill };
