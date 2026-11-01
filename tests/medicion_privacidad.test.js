import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import app from '../src/app.js';
import User from '../src/models/user_model.js';
import Lead from '../src/models/lead_model.js';
import Client from '../src/models/client_model.js';
import PageView from '../src/models/pageview_model.js';
import AnonCounter from '../src/models/anon_counter_model.js';
import ConsentVisit from '../src/models/consent_visit_model.js';
import PrivacyAudit from '../src/models/privacy_audit_model.js';
import { sign_token } from '../src/utils/jwt_utils.js';
import { PRIVACY_VERSION } from '../src/config/services.js';
import { day_in_madrid } from '../src/services/measurement_fields.js';
import { anon_rate_memory, reset_anon_rate_limit } from '../src/middleware/anon_rate_limit.js';
import { convert_lead_to_client } from '../src/services/crm_service.js';

let mongo;
let server;
let base;
let adminToken;
let clientToken;
let ip = 1;

const FORBIDDEN = ['203.0.113.77', 'AgenteSecreto', 'identificador-prohibido', 'dn_vid=secreto'];
const ANON_KEYS = [
  '_id', 'day', 'path', 'referrer_domain', 'utm_source', 'utm_medium', 'utm_campaign',
  'device', 'lang', 'country', 'city', 'type', 'contact_type', 'location', 'count',
];
const VISIT_KEYS = [
  '_id', 'visitor_id', 'type', 'event', 'path', 'contact_type', 'location',
  'lead_id', 'client_id', 'linked_at', 'expires_at', 'created_at',
];

const request = async (path, { method = 'GET', body, token, headers = {}, address } = {}) => {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:4173',
      'X-Forwarded-For': address || `198.51.100.${(ip++ % 200) + 1}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  return { status: response.status, body: parsed, headers: response.headers, text };
};

const lead_body = (overrides = {}) => ({
  request_id: randomUUID(),
  name: 'Ana García',
  company: 'Clínica Norte',
  email: 'ana@example.test',
  service_interest: 'digital_clinic',
  requested_scale: 'pending',
  goal: 'Quiero ordenar las citas y las consultas repetidas',
  budget_range: 'pending',
  landing_path: '/clinica-digital',
  privacy_version: PRIVACY_VERSION,
  privacy_acknowledged: true,
  honeypot: '',
  ...overrides,
});

const anon_body = (overrides = {}) => ({
  type: 'pageview',
  path: '/contacto',
  referrer_domain: 'instagram.com',
  utm_source: 'ig',
  utm_medium: 'social',
  utm_campaign: 'noviembre',
  device: 'mobile',
  lang: 'es',
  ...overrides,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('diginode_medicion'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  const password_hash = await bcrypt.hash('local-review-only', 4);
  const admin = await User.create({
    email: 'admin-medicion@example.test',
    password_hash,
    role: 'admin',
    is_active: true,
  });
  const clientUser = await User.create({
    email: 'cliente-medicion@example.test',
    password_hash,
    role: 'client',
    is_active: true,
  });
  adminToken = sign_token({ user_id: admin._id.toString(), role: 'admin', token_version: 0 });
  clientToken = sign_token({ user_id: clientUser._id.toString(), role: 'client', token_version: 0 });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 120000);

beforeEach(async () => {
  reset_anon_rate_limit();
  await Promise.all([
    AnonCounter.deleteMany({}),
    ConsentVisit.deleteMany({}),
    PageView.deleteMany({}),
    Lead.deleteMany({}),
    Client.deleteMany({}),
    PrivacyAudit.deleteMany({}),
  ]);
});

afterEach(() => {
  delete process.env.ANALYTICS_ANON_RATE_MAX;
  reset_anon_rate_limit();
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('medición anónima', () => {
  const tracked_headers = {
    'User-Agent': 'AgenteSecreto/9.9 identificador-prohibido',
    'X-Forwarded-For': '203.0.113.77',
    Cookie: 'dn_vid=secreto',
    'cf-ipcountry': 'ES',
    'x-vercel-ip-city': 'Madrid',
  };

  it('agrega contadores, ignora identificadores y no fija cookies', async () => {
    const payload = {
      ...anon_body(),
      visitor_id: randomUUID(),
      ip: '203.0.113.77',
      user_agent: 'AgenteSecreto/9.9 identificador-prohibido',
      session_id: 'sesion-secreta',
      country: 'US',
      count: 99,
      day: '1999-01-01',
    };
    const first = await request('/api/analytics/anon', { method: 'POST', body: payload, headers: tracked_headers, address: '203.0.113.77' });
    const second = await request('/api/analytics/anon', { method: 'POST', body: payload, headers: tracked_headers, address: '203.0.113.77' });
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(first.headers.get('set-cookie')).toBeNull();
    expect(first.headers.get('access-control-allow-origin')).toBe('http://localhost:4173');

    const docs = await AnonCounter.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].count).toBe(2);
    expect(docs[0].day).toBe(day_in_madrid());
    expect(docs[0].country).toBe('ES');
    expect(docs[0].city).toBe('Madrid');
    expect(docs[0].path).toBe('/contacto');
    for (const key of Object.keys(docs[0])) expect(ANON_KEYS).toContain(key);
    expect(JSON.stringify(docs[0])).not.toContain('203.0.113.77');
    for (const piece of FORBIDDEN) expect(JSON.stringify(docs[0])).not.toContain(piece);
    expect(JSON.stringify(docs[0])).not.toContain(payload.visitor_id);

    const other = await request('/api/analytics/anon', {
      method: 'POST',
      body: anon_body({ path: '/clinica-digital', type: 'contact_click', contact_type: 'call', location: 'header' }),
      headers: { 'cf-ipcountry': 'FR' },
    });
    expect(other.status).toBe(204);
    expect(await AnonCounter.countDocuments()).toBe(2);

    const admin = await request('/api/admin/analytics/anon?days=7', { token: adminToken });
    expect(admin.status).toBe(200);
    expect(admin.body.data.totals.pageviews).toBe(2);
    expect(admin.body.data.totals.call).toBe(1);
    expect(admin.body.data.by_country.map((row) => row.country).sort()).toEqual(['ES', 'FR']);
    expect(admin.body.data.by_device.find((row) => row.device === 'mobile').pageviews).toBe(2);

    const filtered = await request('/api/admin/analytics/anon?country=ES&device=mobile', { token: adminToken });
    expect(filtered.body.data.totals.pageviews).toBe(2);
    expect(filtered.body.data.totals.call).toBe(0);
    expect((await request('/api/admin/analytics/anon?device=movil', { token: adminToken })).status).toBe(400);
    expect((await request('/api/admin/analytics/anon')).status).toBe(401);
    expect((await request('/api/admin/analytics/anon', { token: clientToken })).status).toBe(403);

    const embedded = await request('/api/admin/analytics', { token: adminToken });
    expect(embedded.body.data.anon.totals.pageviews).toBe(2);
    expect(embedded.body.data).toHaveProperty('contact_events');
  });

  it('rechaza valores no permitidos sin guardar nada', async () => {
    const bad = await request('/api/analytics/anon', { method: 'POST', body: anon_body({ device: 'movil', ip: '203.0.113.77' }) });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Datos de medición no válidos.');
    expect(await AnonCounter.countDocuments()).toBe(0);
  });

  it('limita la tasa sin almacenar la IP', async () => {
    process.env.ANALYTICS_ANON_RATE_MAX = '2';
    reset_anon_rate_limit();
    const address = '203.0.113.77';
    expect((await request('/api/analytics/anon', { method: 'POST', body: anon_body(), address })).status).toBe(204);
    expect((await request('/api/analytics/anon', { method: 'POST', body: anon_body(), address })).status).toBe(204);
    const blocked = await request('/api/analytics/anon', { method: 'POST', body: anon_body(), address });
    expect(blocked.status).toBe(429);
    const memory = anon_rate_memory();
    expect(memory.length).toBeGreaterThan(0);
    expect(memory.every((mark) => typeof mark === 'number')).toBe(true);
    expect(JSON.stringify(memory)).not.toContain(address);
  });
});

describe('visitas con cookie y recorrido del lead', () => {
  it('sin consentimiento no guarda el recorrido ni vincula la cookie', async () => {
    const visitor_id = randomUUID();
    await request('/api/analytics/view', {
      method: 'POST',
      body: { path: '/clinica-digital', referrer: 'https://instagram.com/', session_id: 'pestana-1', visitor_id },
      headers: { 'User-Agent': 'AgenteSecreto/9.9 identificador-prohibido', Cookie: 'dn_vid=secreto' },
      address: '203.0.113.77',
    });
    const saved = await request('/api/leads', {
      method: 'POST',
      body: lead_body({
        email: 'persona-viaje@example.test',
        visitor_id,
        journey_consent: { accepted: false },
        journey: {
          entry: { referrer_domain: 'instagram.com', utm_source: 'ig', utm_medium: 'social', utm_campaign: 'nov' },
          events: [{ type: 'pageview', path: '/clinica-digital', at: new Date().toISOString() }],
        },
      }),
    });
    expect(saved.status).toBe(201);
    const lead = await Lead.findOne({ email: 'persona-viaje@example.test' }).lean();
    expect(lead.visitor_id).toBeUndefined();
    expect(lead.journey_consent).toBeUndefined();
    expect(lead.timeline).toBeUndefined();
    expect(JSON.stringify(lead)).not.toContain('instagram.com');
    const visit = await ConsentVisit.findOne({ visitor_id }).lean();
    expect(visit.lead_id).toBeUndefined();
    expect(visit.expires_at).toBeInstanceOf(Date);
    const days = (visit.expires_at - visit.created_at) / 86400000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(410);
    expect(JSON.stringify(visit)).not.toContain('203.0.113.77');
    expect(JSON.stringify(visit)).not.toContain('AgenteSecreto');
    for (const key of Object.keys(visit)) expect(VISIT_KEYS).toContain(key);
    const indexes = await ConsentVisit.collection.indexes();
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ expireAfterSeconds: 0, key: { expires_at: 1 } }),
    ]));
  });

  it('vincula las visitas anteriores y completa exportación y borrado', async () => {
    const visitor_id = randomUUID();
    const headers = {
      'User-Agent': 'AgenteSecreto/9.9 identificador-prohibido',
      Cookie: 'dn_vid=secreto',
    };
    await request('/api/analytics/view', {
      method: 'POST',
      body: { path: '/clinica-digital', session_id: 'pestana-2', visitor_id },
      headers,
      address: '203.0.113.77',
    });
    await request('/api/analytics/event', {
      method: 'POST',
      body: {
        path: '/clinica-digital',
        session_id: 'pestana-2',
        event: 'contact_whatsapp_click',
        location: 'fab',
        visitor_id,
      },
      headers,
      address: '203.0.113.77',
    });
    const page = await PageView.findOne({ session_id: 'pestana-2' }).lean();
    expect(page.events).toContain('contact_whatsapp_click');
    expect(page.contact_locations).toEqual([{ event: 'contact_whatsapp_click', location: 'fab' }]);
    expect(page.visitor_id).toBeUndefined();

    const rejected = await request('/api/analytics/event', {
      method: 'POST',
      body: { path: '/clinica-digital', session_id: 'pestana-2', event: 'contact_call_click', location: 'popup', visitor_id },
    });
    expect(rejected.status).toBe(204);
    expect((await PageView.findOne({ session_id: 'pestana-2' }).lean()).events).not.toContain('contact_call_click');

    const consent_text = 'Acepto que Diginode guarde el recorrido de esta visita para atender mi solicitud.';
    const created = await request('/api/leads', {
      method: 'POST',
      body: lead_body({
        email: 'persona-viaje@example.test',
        visitor_id: visitor_id.toUpperCase(),
        journey_consent: {
          accepted: true,
          text_version: 'viaje-2026-11',
          text: consent_text,
          at: new Date().toISOString(),
        },
        journey: {
          entry: { referrer_domain: 'instagram.com', utm_source: 'ig', utm_medium: 'social', utm_campaign: 'nov' },
          events: [{
            type: 'contact_click',
            path: '/clinica-digital?email=persona-viaje@example.test',
            at: new Date().toISOString(),
            contact_type: 'form',
            location: 'contact_section',
          }],
        },
      }),
    });
    expect(created.status).toBe(201);

    const lead = await Lead.findOne({ email: 'persona-viaje@example.test' }).lean();
    expect(lead.visitor_id).toBe(visitor_id);
    expect(lead.journey_consent.accepted).toBe(true);
    expect(lead.journey_consent.text).toBe(consent_text);
    expect(lead.journey_consent.text_version).toBe('viaje-2026-11');
    expect(lead.journey_consent.at).toBeInstanceOf(Date);
    expect(lead.journey_entry.referrer_domain).toBe('instagram.com');
    expect(lead.timeline.map((item) => item.origin).sort()).toEqual(['journey', 'visit', 'visit']);
    expect(lead.timeline.some((item) => item.type === 'contact_click' && item.location === 'fab')).toBe(true);
    expect(JSON.stringify(lead.timeline)).not.toContain('persona-viaje@example.test');
    expect(JSON.stringify(lead)).not.toContain('203.0.113.77');

    const visits = await ConsentVisit.find({ visitor_id }).lean();
    expect(visits).toHaveLength(2);
    for (const visit of visits) {
      expect(String(visit.lead_id)).toBe(String(lead._id));
      expect(visit.expires_at).toBeUndefined();
      expect(JSON.stringify(visit)).not.toContain('AgenteSecreto');
    }

    const client = await convert_lead_to_client(lead._id, {
      name: 'Ana García',
      email: 'cliente-vinculado@example.test',
      plan: 'clinica',
    });
    expect(client.visitor_id).toBe(visitor_id);
    expect(client.timeline).toHaveLength(3);
    expect(await ConsentVisit.countDocuments({ client_id: client._id, expires_at: { $exists: false } })).toBe(2);

    const exported = await request('/api/admin/privacy/leads/' + lead._id + '/export', { token: adminToken });
    expect(exported.status).toBe(200);
    expect(exported.body.data.lead.email).toBe('persona-viaje@example.test');
    expect(exported.body.data.lead.journey_consent.text).toBe(consent_text);
    expect(exported.body.data.visits).toHaveLength(2);
    expect(exported.body.data.client.email).toBe('cliente-vinculado@example.test');

    const exported_client = await request('/api/admin/privacy/clients/' + client._id + '/export', { token: adminToken });
    expect(exported_client.status).toBe(200);
    expect(exported_client.body.data.client.timeline).toHaveLength(3);
    expect(exported_client.body.data.lead.visitor_id).toBe(visitor_id);
    expect(exported_client.body.data.visits).toHaveLength(2);
    expect((await request('/api/admin/privacy/clients/' + client._id + '/export', { token: clientToken })).status).toBe(403);

    const audit = await PrivacyAudit.find({ action: 'export' }).lean();
    expect(audit).toHaveLength(2);
    expect(String(audit[0].actor_id)).toBeTruthy();
    expect(audit[0].at).toBeInstanceOf(Date);
    const audit_blob = JSON.stringify(audit);
    expect(audit_blob).not.toContain('persona-viaje@example.test');
    expect(audit_blob).not.toContain(consent_text);
    expect(audit_blob).not.toContain('AgenteSecreto');
    expect(audit_blob).not.toContain('/clinica-digital');

    const erased = await request('/api/admin/privacy/leads/' + lead._id, { method: 'DELETE', token: adminToken });
    expect(erased.status).toBe(200);
    expect(erased.body.erased.visits).toBeGreaterThan(0);
    const after = await Lead.findById(lead._id).lean();
    expect(after.email).toBe('persona-viaje@example.test');
    expect(after.visitor_id).toBeUndefined();
    expect(after.timeline).toBeUndefined();
    expect(after.journey_consent).toBeUndefined();
    expect(await ConsentVisit.countDocuments({ visitor_id })).toBe(0);
    const client_after = await Client.findById(client._id).lean();
    expect(client_after.email).toBe('cliente-vinculado@example.test');
    expect(client_after.timeline).toBeUndefined();
    expect(client_after.visitor_id).toBeUndefined();

    const erase_audit = await PrivacyAudit.findOne({ action: 'erase', subject_type: 'lead' }).lean();
    expect(erase_audit.subject_id).toBe(String(lead._id));
    expect(JSON.stringify(erase_audit)).not.toContain(consent_text);
    expect(JSON.stringify(erase_audit)).not.toContain('persona-viaje@example.test');
  });

  it('borra por visitor_id aunque no exista un lead', async () => {
    const visitor_id = randomUUID();
    await request('/api/analytics/event', {
      method: 'POST',
      body: {
        path: '/contacto',
        session_id: 'pestana-3',
        event: 'contact_form_submit',
        location: 'footer',
        visitor_id,
      },
      headers: { 'User-Agent': 'AgenteSecreto/1.0' },
      address: '203.0.113.77',
    });
    expect(await ConsentVisit.countDocuments({ visitor_id })).toBe(1);
    await PageView.create({
      visitor_hash: 'h',
      session_id: 'pestana-3',
      path: '/contacto',
    });
    const result = await request('/api/admin/privacy/visitors/' + visitor_id, { method: 'DELETE', token: adminToken });
    expect(result.status).toBe(200);
    expect(result.body.erased.leads).toBe(0);
    expect(await ConsentVisit.countDocuments({ visitor_id })).toBe(0);
    const audit = await PrivacyAudit.findOne({ subject_type: 'visitor' }).lean();
    expect(audit.action).toBe('erase');
    expect(audit.subject_id).toBe(visitor_id);
    expect(JSON.stringify(audit)).not.toContain('/contacto');
    expect(JSON.stringify(audit)).not.toContain('203.0.113.77');
    expect((await request('/api/admin/privacy/visitors/no-es-uuid', { method: 'DELETE', token: adminToken })).status).toBe(400);
  });
});
