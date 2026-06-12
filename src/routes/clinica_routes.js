import express from 'express';
import { create_clinica_checkout_session } from '../services/stripe_service.js';
import { form_limiter } from '../middleware/rate_limit.js';

const router = express.Router();

// POST /api/clinica/checkout
// Public — creates a Stripe Checkout subscription session for Clínica Digital.
router.post('/checkout', form_limiter, async (req, res, next) => {
  try {
    const result = await create_clinica_checkout_session();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
