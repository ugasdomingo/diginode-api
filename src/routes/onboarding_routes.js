import { Router } from 'express';
import { authenticate } from '../middleware/auth_middleware.js';
import {
  get_google_auth_url,
  handle_google_callback,
  setup_telegram_bot,
  get_onboarding_config,
  update_onboarding_config,
  get_onboarding_status,
} from '../controllers/onboarding_controller.js';

const router = Router();

// ── Google Calendar OAuth ─────────────────────────────────────────────────────
// Auth URL requires a logged-in client (so we can encode client_id in state)
router.get('/google/auth-url',  authenticate, get_google_auth_url);
// Callback is PUBLIC — Google redirects here after the professional authorizes
router.get('/google/callback',               handle_google_callback);

// ── Telegram bots ─────────────────────────────────────────────────────────────
// Body: { bot_token, bot_username, employee: 'recepcionista' | 'asistente' }
router.post('/telegram/setup', authenticate, setup_telegram_bot);

// ── Configuration ─────────────────────────────────────────────────────────────
router.get('/config',    authenticate, get_onboarding_config);
router.patch('/config',  authenticate, update_onboarding_config);
router.get('/status',    authenticate, get_onboarding_status);

export default router;
