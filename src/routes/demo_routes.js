import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { process_message } from '../services/recepcionista_service.js';
import { confirm_demo_email } from '../services/demo_email_service.js';
import validate from '../middleware/validate_middleware.js';
import { demo_message_schema, demo_confirm_schema } from '../schemas/demo_schema.js';
const router = Router();
router.use(
  rateLimit({ windowMs: 15 * 60000, limit: 40, standardHeaders: true, legacyHeaders: false })
);
router.post('/message', validate(demo_message_schema), async (req, res, next) => {
  try {
    const result = await process_message({ ...req.body, platform: 'website', is_demo: true });
    res.json({
      success: true,
      reply: result.response,
      capped: result.capped ?? false,
      actions: result.actions,
      pending_action: result.pending_action,
    });
  } catch (err) {
    next(err);
  }
});
router.post('/confirm-email', validate(demo_confirm_schema), async (req, res, next) => {
  try {
    res.json(await confirm_demo_email(req.body.contact_id, req.body.action_id));
  } catch (err) {
    next(err);
  }
});
export default router;
