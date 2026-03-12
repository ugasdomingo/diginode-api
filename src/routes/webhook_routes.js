import { Router } from 'express';
import { get_conversation, save_conversation_turn, handle_make_inbound, handle_content_ready, handle_stripe, handle_cal } from '../controllers/webhook_controller.js';
import verify_make_middleware from '../middleware/verify_make_middleware.js';
import verify_stripe_middleware from '../middleware/verify_stripe_middleware.js';
import verify_cal_middleware from '../middleware/verify_cal_middleware.js';

const router = Router();

// Escenario 1 — Step 1: fetch (or create) lead history before AI call
router.get('/make/conversation', verify_make_middleware, get_conversation);

// Escenario 1 — Step 2: save user message + AI response after Make calls the AI
router.post('/make/conversation', verify_make_middleware, save_conversation_turn);

// Legacy: receives inbound DMs and handles AI internally (kept for rollback)
router.post('/make/inbound', verify_make_middleware, handle_make_inbound);

// Make.com notifies when a content campaign proposal is ready
router.post('/make/content-ready', verify_make_middleware, handle_content_ready);

// express.raw() is applied in app.js for this path; verify_stripe_middleware reads req.body as Buffer
router.post('/stripe', verify_stripe_middleware, handle_stripe);

// Cal.com meeting booking notifications
router.post('/cal', verify_cal_middleware, handle_cal);

export default router;
