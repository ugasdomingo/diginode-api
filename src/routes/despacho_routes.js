import express from 'express';
import { create_despacho_checkout_session } from '../services/stripe_service.js';

const router = express.Router();

// POST /api/despacho/checkout
// Public — creates a Stripe Checkout subscription session for Despacho Digital.
router.post('/checkout', async (req, res, next) => {
  try {
    const result = await create_despacho_checkout_session();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
