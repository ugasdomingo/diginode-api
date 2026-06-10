import express from 'express';
import { create_entrepreneur_checkout_session } from '../services/stripe_service.js';
import { form_limiter } from '../middleware/rate_limit.js';

const router = express.Router();

// POST /api/entrepreneur/checkout
// Public — creates a Stripe Checkout subscription session for the flagship
// Plan Entrepreneur (promo 300€/mes x6 → 200€/mes). Canonical replacement for
// the legacy /api/despacho/checkout, which stays alive for old links.
router.post('/checkout', form_limiter, async (req, res, next) => {
  try {
    const result = await create_entrepreneur_checkout_session();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
