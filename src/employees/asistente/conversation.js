import { run_turn } from '../../services/anthropic_service.js';
import ClientConfig from '../../models/client_config_model.js';
import Client from '../../models/client_model.js';
import { TASK_TOOL_DEFS, execute_task_tool } from './tools/task_tools.js';
import asistente_module from './index.js';

// ── History helpers ──────────────────────────────────────────────────────────

// Returns the last N turns of the Asistente's Telegram conversation from DB.
const build_history = (config, max_turns = 20) => {
  const history = config?.asistente?.telegram_history ?? [];
  return history.slice(-max_turns).map(h => ({ role: h.role, content: h.content }));
};

// Appends a turn to the Asistente's Telegram history in the ClientConfig document.
const save_turn = async (client_id, user_text, assistant_text) => {
  await ClientConfig.findOneAndUpdate(
    { client_id },
    {
      $push: {
        'asistente.telegram_history': {
          $each: [
            { role: 'user',      content: user_text,      timestamp: new Date() },
            { role: 'assistant', content: assistant_text, timestamp: new Date() },
          ],
          $slice: -40,   // keep last 40 turns (20 exchanges)
        },
      },
    }
  );
};

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Processes a command from the professional to the Asistente via Telegram.
 *
 * @param {object} opts
 * @param {string} opts.client_id  — MongoDB ObjectId string
 * @param {string} opts.text       — The professional's message
 * @returns {Promise<string>}
 */
const process_asistente_command = async ({ client_id, text }) => {
  const [config, client] = await Promise.all([
    ClientConfig.findOne({ client_id }),
    Client.findById(client_id).select('name company'),
  ]);

  const employee_cfg    = config?.asistente ?? {};
  const business_name   = client?.company ?? client?.name ?? 'el negocio';

  const system_prompt = asistente_module.build_system_prompt({
    business_name,
    employee_name:    employee_cfg.employee_name,
    professional_name: client?.name,
    writing_style:    employee_cfg.writing_style,
    methodology:      employee_cfg.methodology,
  });

  // Load conversation history from DB
  const history  = build_history(config);
  const messages = [
    ...history,
    { role: 'user', content: text },
  ];

  const tool_context = { client_id };

  const reply = await run_turn({
    employee:      'asistente',
    system:        system_prompt,
    messages,
    tools:         TASK_TOOL_DEFS,
    tool_executor: (name, input) => execute_task_tool(name, input, tool_context),
  });

  // Persist the turn
  await save_turn(client_id, text, reply);

  return reply;
};

export { process_asistente_command };
