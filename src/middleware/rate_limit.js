import { rateLimit } from 'express-rate-limit';

// Brute-force guard for credential endpoints. Successful logins don't count, so
// legitimate users are never locked out; only repeated failures burn the budget.
export const auth_limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' },
});

// Spam guard for unauthenticated public forms and checkout starters.
export const form_limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
});
