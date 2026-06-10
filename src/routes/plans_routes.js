import { Router } from 'express';
import { PLANS, public_plan } from '../config/plans.js';

const router = Router();

// GET /api/plans — public. Single source of truth consumed by the client so it
// never hardcodes prices. Returns every plan with its commercial `role`.
router.get('/', (_req, res) => {
  const plans = Object.values(PLANS).map(public_plan);
  res.json({ success: true, data: { plans } });
});

export default router;
