import { Router } from 'express';
import {
  get_conversation, save_conversation_turn, handle_make_inbound,
  verify_whatsapp, handle_whatsapp,
  verify_instagram, handle_instagram,
  handle_make_reply, get_knowledge,
  handle_content_ready, handle_paypal, handle_cal,
} from '../controllers/webhook_controller.js';
import verify_make_middleware from '../middleware/verify_make_middleware.js';
import verify_paypal_middleware from '../middleware/verify_paypal_middleware.js';
import verify_cal_middleware from '../middleware/verify_cal_middleware.js';

const router = Router();

// ── Meta direct webhooks (no auth — Meta signs with its own verification) ─────
router.get('/meta/whatsapp',  verify_whatsapp);
router.post('/meta/whatsapp', handle_whatsapp);
router.get('/meta/instagram',  verify_instagram);
router.post('/meta/instagram', handle_instagram);

// ── Make.com → API ────────────────────────────────────────────────────────────
// Claude's reply from Make (saves to history, returns send instructions)
router.post('/make/reply', verify_make_middleware, handle_make_reply);

// Make fetches FAQ knowledge before calling Claude
router.get('/make/knowledge', verify_make_middleware, get_knowledge);

// Make notifies when a content campaign proposal is ready
router.post('/make/content-ready', verify_make_middleware, handle_content_ready);

// ── Legacy endpoints (kept for rollback) ─────────────────────────────────────
router.get('/make/conversation', verify_make_middleware, get_conversation);
router.post('/make/conversation', verify_make_middleware, save_conversation_turn);
router.post('/make/inbound', verify_make_middleware, handle_make_inbound);

// ── Payment & booking ─────────────────────────────────────────────────────────
router.post('/paypal', verify_paypal_middleware, handle_paypal);
router.post('/cal', verify_cal_middleware, handle_cal);

export default router;
