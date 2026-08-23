import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { record_view, record_duration, record_event } from '../services/analytics_service.js';

const router = Router();

// Límite generoso: una persona navegando genera varios avisos por minuto, pero
// corta a quien intente inflar las cifras desde un script.
const beacon_limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: false,
  legacyHeaders: false,
  // Sin cuerpo de error: el navegador envía esto en segundo plano y nadie lo lee.
  handler: (_req, res) => res.status(204).end(),
});

router.use(beacon_limiter);

// La IP se usa sólo para calcular el hash diario del visitante y no se guarda.
const client_ip = (req) => req.ip ?? req.socket?.remoteAddress ?? '';

// POST /api/analytics/view — entrada a una página pública.
router.post('/view', async (req, res) => {
  try {
    await record_view({
      path:       req.body?.path,
      referrer:   req.body?.referrer,
      session_id: req.body?.session_id,
      ip:         client_ip(req),
      user_agent: req.headers['user-agent'],
    });
  } catch {
    // La analítica nunca debe romper la navegación de nadie.
  }
  res.status(204).end();
});

// POST /api/analytics/leave — tiempo que estuvo visible la página.
// Llega por sendBeacon al ocultar o cerrar la pestaña.
router.post('/leave', async (req, res) => {
  try {
    await record_duration({
      session_id: req.body?.session_id,
      path:       req.body?.path,
      seconds:    req.body?.seconds,
    });
  } catch { /* silencioso a propósito */ }
  res.status(204).end();
});

// POST /api/analytics/event — hito de conversión (clic en comprar, compra).
router.post('/event', async (req, res) => {
  try {
    await record_event({
      session_id: req.body?.session_id,
      path:       req.body?.path,
      event:      req.body?.event,
    });
  } catch { /* silencioso a propósito */ }
  res.status(204).end();
});

export default router;
