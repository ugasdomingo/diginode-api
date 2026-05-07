import ClientConfig from '../../../models/client_config_model.js';
import { send_message, send_typing, parse_inbound, verify_secret } from '../../../services/telegram_service.js';
import { process_asistente_command } from '../conversation.js';

/**
 * Handles an inbound Telegram webhook for the Asistente Ejecutivo.
 * Each client registers a separate Telegram bot for their Asistente.
 *
 * Route: POST /api/webhooks/asistente/telegram/:client_id
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
const handle_asistente_telegram = async (req, res) => {
  // Always ACK immediately — Telegram expects < 5s response
  res.sendStatus(200);

  const { client_id } = req.params;

  // Validate the Telegram secret token header using the Asistente's own secret
  const incoming_secret = req.headers['x-telegram-bot-api-secret-token'];
  const config          = await ClientConfig.findOne({ client_id });

  if (!config) return;
  if (!verify_secret(incoming_secret, config.asistente_telegram_secret)) return;

  const parsed = parse_inbound(req.body);
  if (!parsed) return;

  const { chat_id, text } = parsed;
  if (!text) return;

  // Send typing indicator
  send_typing(config.asistente_telegram_bot_token, chat_id).catch(() => {});

  try {
    const reply = await process_asistente_command({ client_id, text });
    await send_message(config.asistente_telegram_bot_token, chat_id, reply);
  } catch (err) {
    console.error(`[asistente/telegram] client ${client_id}:`, err.message);

    const employee_name = config.asistente?.employee_name ?? 'tu asistente';
    await send_message(
      config.asistente_telegram_bot_token,
      chat_id,
      `Lo siento, tuve un problema técnico. Por favor intenta de nuevo en un momento.`
    ).catch(() => {});
  }
};

export { handle_asistente_telegram };
