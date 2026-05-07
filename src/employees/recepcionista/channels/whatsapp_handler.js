import ClientConfig from '../../../models/client_config_model.js';
import { send_text, send_typing, mark_read, parse_inbound } from '../../../services/whatsapp_service.js';
import { process_patient_message } from '../conversation.js';

// In-memory buffer per (phone_number_id + patient_phone) — same 10s strategy as legacy
const buffers = new Map();
const BUFFER_DELAY_MS = 10_000;

const buffer_key = (phone_number_id, from) => `${phone_number_id}:${from}`;

/**
 * Receives a raw Meta WhatsApp webhook body and routes it to the
 * correct client's Recepcionista. If no client is configured for
 * the incoming phone_number_id, falls through silently.
 *
 * @param {object} body - Raw webhook payload from Meta
 */
const handle_whatsapp_inbound = (body) => {
  const parsed = parse_inbound(body);
  if (!parsed) return;

  const { phone_number_id, from, message_id, text, sender_name } = parsed;

  const key      = buffer_key(phone_number_id, from);
  const existing = buffers.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.messages.push(text);
  } else {
    buffers.set(key, { phone_number_id, from, sender_name, message_id, messages: [text] });
  }

  const entry  = buffers.get(key);
  entry.timer  = setTimeout(() => _flush(key), BUFFER_DELAY_MS);
};

const _flush = async (key) => {
  const entry = buffers.get(key);
  if (!entry) return;
  buffers.delete(key);

  const { phone_number_id, from, sender_name, message_id, messages } = entry;
  const combined_text = messages.join('\n');

  // Find which client owns this WhatsApp number
  const config = await ClientConfig.findOne({ whatsapp_phone_number_id: phone_number_id });
  if (!config) {
    // Not a configured employee client — skip (legacy flow handles it)
    return;
  }

  const client_id = config.client_id;

  // Send typing indicator (fire and forget)
  mark_read(phone_number_id, config.whatsapp_access_token, message_id).catch(() => {});
  send_typing(phone_number_id, config.whatsapp_access_token, from, message_id).catch(() => {});

  try {
    const reply = await process_patient_message({
      client_id,
      channel:     'whatsapp',
      text:        combined_text,
      phone:       from,
      sender_name,
    });

    await send_text(phone_number_id, config.whatsapp_access_token, from, reply);
  } catch (err) {
    console.error(`[whatsapp_handler] client ${client_id}, from ${from}:`, err.message);

    // Send a safe fallback to the patient
    const employee_name = config.recepcionista?.employee_name ?? 'tu asistente';
    await send_text(
      phone_number_id,
      config.whatsapp_access_token,
      from,
      `Hola, soy ${employee_name}. En este momento tengo un problema técnico. Vuelvo enseguida, perdona las molestias.`
    ).catch(() => {});
  }
};

export { handle_whatsapp_inbound };
