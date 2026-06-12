import express from 'express';
import { create_ai_plan_checkout_session, AI_PLANS, EMPLOYEE_NAMES } from '../services/stripe_service.js';
import validate from '../middleware/validate_middleware.js';
import { form_limiter } from '../middleware/rate_limit.js';
import { ai_plan_checkout_schema } from '../schemas/checkout_schema.js';

const router = express.Router();

// GET /api/empleados/plans
// Returns the available AI plans and their pricing — used by the frontend PlanesView.
router.get('/plans', (_req, res) => {
  const plans = Object.entries(AI_PLANS).map(([slug, config]) => ({
    slug,
    name:    config.name,
    monthly: config.monthly,
    setup:   config.setup,
  }));

  const employees = Object.entries(EMPLOYEE_NAMES).map(([slug, name]) => ({ slug, name }));

  res.json({ success: true, data: { plans, employees } });
});

// POST /api/empleados/checkout
// Public — no auth required. Creates a Stripe Checkout session for an AI plan.
// Body: { plan: 'individual'|'estudio'|'clinica', employee_id?: string }
router.post('/checkout', form_limiter, validate(ai_plan_checkout_schema), async (req, res, next) => {
  try {
    const { plan, employee_id } = req.body;
    const result = await create_ai_plan_checkout_session({ plan, employee_id });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
