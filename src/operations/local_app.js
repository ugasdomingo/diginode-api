import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { z, ZodError } from 'zod';
import { OperationsError } from './service.js';

export function create_lab_app(service) {
  const app = express(); const sessions = new Map();
  const origins = new Set(['http://127.0.0.1:5174', 'http://localhost:5174']);
  app.use(helmet());
  app.use((req, res, next) => {
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return res.status(403).json({ message: 'El laboratorio solo admite acceso local.' });
    if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ message: 'Origen no autorizado.' });
    next();
  });
  app.use(rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use(express.json({ limit: '32kb' }));
  const route = (handler) => async (req, res, next) => { try { res.json({ data: await handler(req) }); } catch (error) { next(error); } };
  app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'local_sandbox', integrations: 'disabled' }));
  app.post('/api/lab/session', route((req) => {
    const { business_id } = z.object({ business_id: z.enum(['diginode', 'consulta-demo']) }).strict().parse(req.body);
    if (sessions.size > 1000) { for (const [key, value] of sessions) if (value.expires_at < Date.now()) sessions.delete(key); }
    if (sessions.size >= 1000) throw new OperationsError(429, 'Demasiadas sesiones locales. Reinicia el laboratorio.');
    const token = randomBytes(32).toString('hex'); sessions.set(token, { tenant_id: business_id, expires_at: Date.now() + 3600000 });
    return { token, mode: 'local_sandbox' };
  }));
  app.use('/api/lab', (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const session = sessions.get(token);
    if (!session || session.expires_at < Date.now()) return res.status(401).json({ message: 'Abre una sesión local para continuar.' });
    req.tenant_id = session.tenant_id; next();
  });
  app.get('/api/lab/snapshot', route((req) => service.snapshot(req.tenant_id)));
  app.get('/api/lab/slots', route((req) => { const { service_id } = z.object({ service_id: z.string().min(1).max(60) }).strict().parse(req.query); return service.slots(req.tenant_id, service_id); }));
  app.put('/api/lab/config', route((req) => service.configure(req.tenant_id, req.body)));
  app.post('/api/lab/contacts', route((req) => service.contact(req.tenant_id, req.body)));
  app.post('/api/lab/messages', route((req) => service.message(req.tenant_id, req.body)));
  app.post('/api/lab/pause', route((req) => { const { paused } = z.object({ paused: z.boolean() }).strict().parse(req.body); return service.pause(req.tenant_id, paused); }));
  app.post('/api/lab/bookings', route((req) => service.book(req.tenant_id, req.body)));
  app.post('/api/lab/bookings/:id/cancel', route((req) => service.cancel(req.tenant_id, z.string().uuid().parse(req.params.id))));
  app.post('/api/lab/bookings/:id/reschedule', route((req) => service.reschedule(req.tenant_id, z.string().uuid().parse(req.params.id), req.body)));
  app.post('/api/lab/content', route((req) => service.generate_content(req.tenant_id, req.body)));
  app.put('/api/lab/content/:id', route((req) => service.edit_content(req.tenant_id, z.string().uuid().parse(req.params.id), req.body)));
  app.post('/api/lab/content/:id/approve', route((req) => { const { revision } = z.object({ revision: z.number().int().positive() }).strict().parse(req.body); return service.approve_content(req.tenant_id, z.string().uuid().parse(req.params.id), revision); }));
  app.post('/api/lab/content/:id/schedule', route((req) => service.schedule_content(req.tenant_id, z.string().uuid().parse(req.params.id), req.body)));
  app.post('/api/lab/checkout', route((req) => { const { plan } = z.object({ plan: z.enum(['esencial', 'consulta', 'crecimiento']) }).strict().parse(req.body); return service.checkout(req.tenant_id, plan); }));
  app.post('/api/lab/onboarding', route((req) => service.onboard(req.tenant_id, req.body)));
  app.post('/api/lab/activate', route((req) => service.activate(req.tenant_id)));
  app.post('/api/lab/jobs/run', route((req) => service.process_jobs(req.tenant_id)));
  app.get('/api/lab/export', route((req) => service.export(req.tenant_id)));
  app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
  app.use((error, _req, res, _next) => {
    const status = error instanceof ZodError ? 400 : error instanceof OperationsError ? error.status : error.status === 413 ? 413 : 500;
    res.status(status).json({ message: error instanceof ZodError ? 'Revisa los datos del formulario.' : status === 500 ? 'No se pudo completar la operación local.' : error.message });
  });
  return app;
}
