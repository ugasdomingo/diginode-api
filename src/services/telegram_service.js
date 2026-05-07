// Telegram Bot API — direct fetch, no third-party library
// Docs: https://core.telegram.org/bots/api

const TELEGRAM_BASE = 'https://api.telegram.org/bot';

const api = (bot_token, method, body = null) =>
  fetch(`${TELEGRAM_BASE}${bot_token}/${method}`, {
    method:  body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());

/**
 * Sends a text message to a Telegram chat.
 * @param {string} bot_token
 * @param {string|number} chat_id
 * @param {string} text           - Supports basic Markdown
 * @param {object} extra          - Optional extra params (reply_markup, etc.)
 */
const send_message = (bot_token, chat_id, text, extra = {}) =>
  api(bot_token, 'sendMessage', {
    chat_id,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });

/**
 * Sends a "typing…" action indicator to a chat.
 */
const send_typing = (bot_token, chat_id) =>
  api(bot_token, 'sendChatAction', { chat_id, action: 'typing' });

/**
 * Registers a webhook URL for the bot.
 * Called once during client onboarding setup.
 * @param {string} bot_token
 * @param {string} webhook_url  - Must be HTTPS. Include client_id in path for routing.
 * @param {string} secret       - Telegram will send this in X-Telegram-Bot-Api-Secret-Token header
 */
const set_webhook = (bot_token, webhook_url, secret) =>
  api(bot_token, 'setWebhook', {
    url:          webhook_url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });

/**
 * Removes the webhook for the bot.
 */
const delete_webhook = (bot_token) =>
  api(bot_token, 'deleteWebhook', { drop_pending_updates: true });

/**
 * Validates the secret token header from a Telegram webhook request.
 */
const verify_secret = (req_secret, expected_secret) =>
  req_secret === expected_secret;

/**
 * Extracts the relevant fields from a Telegram webhook payload.
 * Returns null if not a processable text message.
 */
const parse_inbound = (body) => {
  const msg = body?.message;
  if (!msg?.text) return null;

  return {
    chat_id:    msg.chat.id,
    message_id: msg.message_id,
    text:       msg.text,
    from_id:    msg.from?.id,
    username:   msg.from?.username ?? null,
    first_name: msg.from?.first_name ?? null,
  };
};

export { send_message, send_typing, set_webhook, delete_webhook, verify_secret, parse_inbound };
