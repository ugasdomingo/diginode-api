import express from 'express';
import { create_bolsa_checkout_session } from '../services/stripe_service.js';

const router = express.Router();

// POST /api/bolsa/checkout
// Public — no auth required. Creates a Stripe Checkout session for the Bolsa de Empleo setup fee.
router.post('/checkout', async (req, res, next) => {
  try {
    const { employee_ids, installments } = req.body;
    const result = await create_bolsa_checkout_session({ employee_ids, installments });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
