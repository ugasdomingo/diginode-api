import ClientConfig from '../../../models/client_config_model.js';
import { send_message, send_typing, parse_inbound, verify_secret } from '../../../services/telegram_service.js';
import { process_professional_command } from '../conversation.js';

// Short conversation history for the professional's Telegram session (in-memory per chat_id)
// Persisted to DB in a future iteration; for now kept in memory between server restarts.
const pro_history = new Map(); // chat_id → [{ role, content }]
const MAX_PRO_HISTORY = 20;

/**
 * Handles an inbound Telegram webhook for a specific client.
 * The URL path includes the client_id, which is used to look up the bot token
 * and validate the secret header.
 *
 * Route: POST /api/webhooks/telegram/:client_id
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
const handle_telegram_inbound = async (req, res) => {
  // Always ACK immediately — Telegram expects < 5s response
  res.sendStatus(200);

  const { client_id } = req.params;

  // Validate the Telegram secret token header
  const incoming_secret = req.headers['x-telegram-bot-api-secret-token'];
  const config          = await ClientConfig.findOne({ client_id });

  if (!config) return;
  if (!verify_secret(incoming_secret, config.telegram_secret)) return;

  const parsed = parse_inbound(req.body);
  if (!parsed) return;

  const { chat_id, text, first_name } = parsed;

  // Send typing indicator
  send_typing(config.telegram_bot_token, chat_id).catch(() => {});

  // Load or init professional's conversation history
  const history = pro_history.get(chat_id) ?? [];

  try {
    const reply = await process_professional_command({
      client_id,
      text,
      history,
    });

    // Update in-memory history
    const updated = [
      ...history,
      { role: 'user',      content: text  },
      { role: 'assistant', content: reply },
    ].slice(-MAX_PRO_HISTORY);

    pro_history.set(chat_id, updated);

    await send_message(config.telegram_bot_token, chat_id, reply);
  } catch (err) {
    console.error(`[telegram_handler] client ${client_id}:`, err.message);

    const employee_name = config.recepcionista?.employee_name ?? 'tu asistente';
    await send_message(
      config.telegram_bot_token,
      chat_id,
      `Lo siento, tuve un problema técnico. Por favor intenta de nuevo en un momento.`
    ).catch(() => {});
  }
};

export { handle_telegram_inbound };
