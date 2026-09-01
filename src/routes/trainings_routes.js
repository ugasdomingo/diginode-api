import { Router } from 'express';
import { get_public_training, enroll_free, claim_training_session } from '../services/trainings_service.js';
import { create_training_checkout_session } from '../services/stripe_service.js';
import { auth_limiter, form_limiter } from '../middleware/rate_limit.js';

const router = Router();

// POST /api/trainings/claim
// Public — exchanges a paid Stripe Checkout session for a portal session so the
// buyer lands logged in right after paying. Single use, verified against Stripe.
// Declared before /:slug so "claim" is never read as a training slug.
// Uses auth_limiter (not form_limiter): this endpoint mints credentials.
router.post('/claim', auth_limiter, async (req, res, next) => {
  try {
    const result = await claim_training_session(req.body?.session_id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/trainings/:slug/enroll
// Público — alta por formulario para las formaciones gratuitas. Devuelve una
// sesión iniciada solo si la cuenta se acaba de crear (ver enroll_free).
// Rate limit de credenciales, no de formulario: puede emitir un token.
router.post('/:slug/enroll', auth_limiter, async (req, res, next) => {
  try {
    const result = await enroll_free({
      slug:            req.params.slug,
      name:            req.body?.name,
      email:           req.body?.email,
      pain_point:      req.body?.pain_point,
      accepts_privacy: req.body?.accepts_privacy,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/trainings/:slug
// Public — landing payload: details plus live seat availability.
router.get('/:slug', async (req, res, next) => {
  try {
    const training = await get_public_training(req.params.slug);
    res.json({ success: true, data: { training } });
  } catch (err) {
    next(err);
  }
});

// POST /api/trainings/:slug/checkout
// Public — creates the one-off Stripe Checkout session for a training.
router.post('/:slug/checkout', form_limiter, async (req, res, next) => {
  try {
    const result = await create_training_checkout_session(req.params.slug);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
