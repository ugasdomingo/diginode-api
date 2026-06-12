import express from 'express';
import { process_message } from '../services/recepcionista_service.js';
import validate from '../middleware/validate_middleware.js';
import { form_limiter } from '../middleware/rate_limit.js';
import { demo_message_schema } from '../schemas/demo_schema.js';

const router = express.Router();

// POST /api/demo/message
// Public entry point for the live Nora demo. Wired to the demo WhatsApp number's
// Make.com scenario (F3-1) and/or a web widget (F2-4). Always runs in demo mode,
// so it is capped per contact (DEMO_MESSAGE_LIMIT) inside the service.
router.post('/message', form_limiter, validate(demo_message_schema), async (req, res, next) => {
  try {
    const { contact_id, platform, message, sender_name } = req.body;
    const result = await process_message({ contact_id, platform, message, sender_name, is_demo: true });
    res.json({ success: true, reply: result.response, capped: result.capped ?? false });
  } catch (err) {
    next(err);
  }
});

export default router;
