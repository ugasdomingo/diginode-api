import ClientConfig from '../models/client_config_model.js';
import { get_auth_url, exchange_code } from '../services/google_calendar_service.js';
import { set_webhook } from '../services/telegram_service.js';

// ── Google Calendar OAuth ────────────────────────────────────────────────────

/**
 * GET /api/onboarding/google/auth-url
 * Returns the Google OAuth authorization URL for the logged-in client.
 * The client_id is encoded as the OAuth state so we know who to save tokens for.
 */
const get_google_auth_url = (req, res) => {
  const client_id = String(req.user._id);
  const url = get_auth_url(client_id);
  res.json({ success: true, data: { url } });
};

/**
 * GET /api/onboarding/google/callback
 * Public (no auth). Called by Google with ?code=...&state=client_id
 * Exchanges the code for tokens and saves them to ClientConfig.
 * Redirects to the onboarding success page.
 */
const handle_google_callback = async (req, res, next) => {
  try {
    const { code, state: client_id } = req.query;

    if (!code || !client_id) {
      return res.status(400).json({ success: false, message: 'Missing code or state parameter' });
    }

    const tokens = await exchange_code(code);

    await ClientConfig.findOneAndUpdate(
      { client_id },
      {
        $set: {
          'google_oauth.access_token':  tokens.access_token,
          'google_oauth.refresh_token': tokens.refresh_token ?? undefined,
          'google_oauth.expiry_date':   tokens.expiry_date,
        },
      },
      { upsert: true, new: true }
    );

    // Redirect to the portal onboarding page with a success flag
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontend}/portal/onboarding?google=connected`);
  } catch (err) {
    next(err);
  }
};

// ── Telegram bot setup ───────────────────────────────────────────────────────

/**
 * POST /api/onboarding/telegram/setup
 * Registers the Telegram webhook for the Recepcionista bot.
 * Body: { bot_token, bot_username, employee: 'recepcionista' | 'asistente' }
 */
const setup_telegram_bot = async (req, res, next) => {
  try {
    const client_id = String(req.user._id);
    const { bot_token, bot_username, employee = 'recepcionista' } = req.body;

    if (!bot_token) {
      return res.status(400).json({ success: false, message: 'bot_token is required' });
    }

    const base_url = process.env.API_BASE_URL ?? `https://${req.hostname}`;
    const secret   = _generate_secret();

    let webhook_url;
    if (employee === 'asistente') {
      webhook_url = `${base_url}/api/webhooks/asistente/telegram/${client_id}`;
    } else {
      webhook_url = `${base_url}/api/webhooks/telegram/${client_id}`;
    }

    await set_webhook(bot_token, webhook_url, secret);

    // Persist token + secret to ClientConfig
    const update_fields = employee === 'asistente'
      ? {
          asistente_telegram_bot_token:    bot_token,
          asistente_telegram_bot_username: bot_username ?? null,
          asistente_telegram_secret:       secret,
        }
      : {
          telegram_bot_token:    bot_token,
          telegram_bot_username: bot_username ?? null,
          telegram_secret:       secret,
        };

    await ClientConfig.findOneAndUpdate(
      { client_id },
      { $set: update_fields },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      data: {
        employee,
        webhook_url,
        message: `Webhook de Telegram registrado para el ${employee === 'asistente' ? 'Asistente Ejecutivo' : 'Recepcionista'}.`,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── ClientConfig CRUD ────────────────────────────────────────────────────────

/**
 * GET /api/onboarding/config
 * Returns the non-sensitive onboarding config for the logged-in client.
 */
const get_onboarding_config = async (req, res, next) => {
  try {
    const client_id = String(req.user._id);
    const config = await ClientConfig.findOne({ client_id })
      .select('-google_oauth.access_token -whatsapp_access_token -telegram_bot_token -telegram_secret -asistente_telegram_bot_token -asistente_telegram_secret');

    res.json({ success: true, data: config ?? {} });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/onboarding/config
 * Updates non-credential onboarding config fields.
 * Allowed fields: appointment defaults, per-employee personality settings.
 * Credential fields (tokens, secrets) cannot be updated through this endpoint.
 */
const update_onboarding_config = async (req, res, next) => {
  try {
    const client_id = String(req.user._id);

    // Strip any credential fields the client might try to inject
    const BLOCKED = [
      'whatsapp_access_token', 'telegram_bot_token', 'telegram_secret',
      'asistente_telegram_bot_token', 'asistente_telegram_secret',
      'google_oauth',
    ];

    const safe_body = { ...req.body };
    BLOCKED.forEach(k => delete safe_body[k]);

    const config = await ClientConfig.findOneAndUpdate(
      { client_id },
      { $set: safe_body },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/onboarding/status
 * Returns a structured summary of what's configured and what's pending.
 */
const get_onboarding_status = async (req, res, next) => {
  try {
    const client_id = String(req.user._id);
    const config = await ClientConfig.findOne({ client_id });

    const status = {
      google_calendar: Boolean(config?.google_oauth?.refresh_token),
      whatsapp:        Boolean(config?.whatsapp_phone_number_id && config?.whatsapp_access_token),
      recepcionista_telegram: Boolean(config?.telegram_bot_token),
      asistente_telegram:     Boolean(config?.asistente_telegram_bot_token),
      recepcionista_config:   Boolean(config?.recepcionista?.services),
      asistente_config:       Boolean(config?.asistente?.methodology),
    };

    const all_done = Object.values(status).every(Boolean);

    res.json({ success: true, data: { status, all_done } });
  } catch (err) {
    next(err);
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const _generate_secret = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

export {
  get_google_auth_url,
  handle_google_callback,
  setup_telegram_bot,
  get_onboarding_config,
  update_onboarding_config,
  get_onboarding_status,
};
