import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import validate from '../middleware/validate_middleware.js';
import { lead_schema } from '../schemas/lead_schema.js';
import { capture_lead } from '../services/lead_capture_service.js';

const router = Router();
router.post(
  '/',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false }),
  validate(lead_schema),
  async (req, res, next) => {
    try {
      res.status(201).json(await capture_lead(req.body));
    } catch (err) {
      next(err);
    }
  }
);
export default router;
