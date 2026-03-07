import { Router } from 'express';
import { handle_make_inbound, handle_stripe, handle_cal } from '../controllers/webhook_controller.js';
import verify_make_middleware from '../middleware/verify_make_middleware.js';
import verify_stripe_middleware from '../middleware/verify_stripe_middleware.js';
import verify_cal_middleware from '../middleware/verify_cal_middleware.js';

const router = Router();

// Receives inbound DMs forwarded by Make.com
router.post('/make/inbound', verify_make_middleware, handle_make_inbound);

// express.raw() is applied in app.js for this path; verify_stripe_middleware reads req.body as Buffer
router.post('/stripe', verify_stripe_middleware, handle_stripe);

// Cal.com meeting booking notifications
router.post('/cal', verify_cal_middleware, handle_cal);

export default router;
