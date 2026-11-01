import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import logger from '../utils/logger.js';
import { anon_rate_limit } from '../middleware/anon_rate_limit.js';
import { record_view, record_duration, record_event } from '../services/analytics_service.js';
import {
  geo_from_proxy_headers,
  parse_anon_payload,
  record_anon_hit,
} from '../services/anon_analytics_service.js';

const router = Router();

// Límite por IP, en memoria, para los avisos que ya existían. La medición
// anónima no lo usa: su tope no guarda direcciones.
const beacon_limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: false,
  legacyHeaders: false,
  // Sin cuerpo de error: el navegador envía esto en segundo plano y nadie lo lee.
  handler: (_req, res) => res.status(204).end(),
});

// La IP se usa sólo para calcular el hash diario del visitante y no se guarda.
const client_ip = (req) => req.ip ?? req.socket?.remoteAddress ?? '';

// POST /api/analytics/view — entrada a una página pública.
router.post('/view', beacon_limiter, async (req, res) => {
  try {
    await record_view({
      path:       req.body?.path,
      referrer:   req.body?.referrer,
      session_id: req.body?.session_id,
      visitor_id: req.body?.visitor_id,
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
router.post('/leave', beacon_limiter, async (req, res) => {
  try {
    await record_duration({
      session_id: req.body?.session_id,
      path:       req.body?.path,
      seconds:    req.body?.seconds,
    });
  } catch { /* silencioso a propósito */ }
  res.status(204).end();
});

// POST /api/analytics/event — hito de conversión, incluido el contacto.
router.post('/event', beacon_limiter, async (req, res) => {
  try {
    await record_event({
      session_id: req.body?.session_id,
      path:       req.body?.path,
      event:      req.body?.event,
      location:   req.body?.location,
      visitor_id: req.body?.visitor_id,
    });
  } catch { /* silencioso a propósito */ }
  res.status(204).end();
});

// POST /api/analytics/anon — medición agregada sin cookies ni identificadores.
// No lee la IP ni el user-agent. El país, si llega, sale de cabeceras del proxy.
router.post('/anon', anon_rate_limit, async (req, res) => {
  const parsed = parse_anon_payload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ success: false, message: 'Datos de medición no válidos.' });
  }
  try {
    const geo = geo_from_proxy_headers(req.headers);
    await record_anon_hit({ ...parsed.value, country: geo.country, city: geo.city });
    res.status(204).end();
  } catch (err) {
    logger.error({ code: err?.code, path: '/api/analytics/anon' }, 'No se pudo agregar el contador anónimo');
    res.status(500).json({
      success: false,
      message: 'Hay un problema temporal con el servicio. Por favor, inténtalo de nuevo en unos momentos.',
    });
  }
});

export default router;
