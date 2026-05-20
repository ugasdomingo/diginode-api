import { Router } from 'express';
import {
  get_conversation, save_conversation_turn, handle_make_inbound,
  verify_whatsapp, handle_whatsapp,
  verify_instagram, handle_instagram,
  handle_make_reply, get_knowledge,
  handle_content_ready, handle_cal, handle_stripe,
} from '../controllers/webhook_controller.js';
import verify_make_middleware from '../middleware/verify_make_middleware.js';
import verify_cal_middleware from '../middleware/verify_cal_middleware.js';
import verify_stripe_middleware from '../middleware/verify_stripe_middleware.js';

const router = Router();

// Meta webhooks here are only for Diginode's commercial lead capture.
// Client office channels live in each isolated diginode-office instance.
router.get('/meta/whatsapp',  verify_whatsapp);
router.post('/meta/whatsapp', handle_whatsapp);
router.get('/meta/instagram',  verify_instagram);
router.post('/meta/instagram', handle_instagram);

// ── Make.com → API ────────────────────────────────────────────────────────────
router.post('/make/reply',         verify_make_middleware, handle_make_reply);
router.get('/make/knowledge',      verify_make_middleware, get_knowledge);
router.post('/make/content-ready', verify_make_middleware, handle_content_ready);

// ── Legacy endpoints (kept for rollback) ─────────────────────────────────────
router.get('/make/conversation',  verify_make_middleware, get_conversation);
router.post('/make/conversation', verify_make_middleware, save_conversation_turn);
router.post('/make/inbound',      verify_make_middleware, handle_make_inbound);

// ── Booking & payments ────────────────────────────────────────────────────────
router.post('/cal',    verify_cal_middleware,    handle_cal);
router.post('/stripe', verify_stripe_middleware, handle_stripe);

export default router;
