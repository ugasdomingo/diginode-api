import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';

const provider = vi.hoisted(() => ({ email: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider.email };
  },
}));

import app from '../src/app.js';
import User from '../src/models/user_model.js';
import Client from '../src/models/client_model.js';
import OtpChallenge from '../src/models/otp_challenge_model.js';
import Credential from '../src/models/credential_model.js';
import Payment from '../src/models/payment_model.js';
import Invoice from '../src/models/invoice_model.js';
import { stripe, handle_stripe_event } from '../src/services/stripe_service.js';
import { decrypt_secret, encrypt_secret } from '../src/services/vault_crypto.js';

const PASSWORD = 'Clave-segura-123';
const COMMENT = 'NO-ENVIAR-ESTE-COMENTARIO-SECRETO';
const DRIVE = 'https://drive.google.com/file/d/SECRETFILETOKEN123/view';
const VAULT_PASSWORD = 'META-PASSWORD-9f3a';

let mongo;
let server;
let base;
let adminToken;
let clientToken;
let clientId;
const webhooks = [];
const originalFetch = globalThis.fetch.bind(globalThis);

const codeFrom = (html) => {
  const match = String(html || '').match(/data-otp="(\d{6})"/);
  if (!match) throw new Error('el correo no incluye el código');
  return match[1];
};

async function request(path, { method = 'GET', body, token, key } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers['x-api-key'] = key;
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) parsed = JSON.parse(text);
  return { status: response.status, body: parsed, headers: response.headers };
}

async function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

async function verify(challenge_id, code) {
  return request('/api/auth/otp/verify', { method: 'POST', body: { challenge_id, code } });
}

beforeAll(async () => {
  process.env.CREDENTIALS_VAULT_KEY = Buffer.from(cryptoRandom()).toString('base64');
  process.env.OTP_EMAIL_PROVIDER = 'resend';
  process.env.OTP_EMAIL_FROM = 'hola@diginode.test';
  process.env.RESEND_FROM_EMAIL = 'hola@diginode.test';
  process.env.AGENCY_SLACK_WEBHOOK_URL = 'https://slack.test/hook';
  process.env.AGENCY_EVENT_WEBHOOK_URL = 'https://events.test/hook';
  process.env.AGENCY_APP_URL = 'https://midiginode.com/agencia';
  process.env.CLIENT_2FA_REQUIRED = 'true';
  provider.email.mockResolvedValue({ data: { id: 'email-1' }, error: null });

  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('diginode_agency_test'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    const href = String(url);
    if (href.includes('slack.test') || href.includes('events.test')) {
      webhooks.push({ url: href, body: options?.body ? JSON.parse(options.body) : null });
      return new Response('ok', { status: 200 });
    }
    return originalFetch(url, options);
  });

  const password_hash = await bcrypt.hash(PASSWORD, 4);
  await User.create({
    email: 'domingo@example.test',
    password_hash,
    role: 'admin',
    is_active: true,
  });
  const clientUser = await User.create({
    email: 'cliente@example.test',
    password_hash,
    role: 'client',
    is_active: true,
  });
  const client = await Client.create({
    name: 'Cafetería Norte',
    email: clientUser.email,
    plan: 'individual',
    status: 'active',
    onboarding_form: { slack_bot_token: 'SLACK-BOT-SECRET', business_name: 'Norte' },
  });
  await Client.updateOne({ _id: client._id }, { office_admin_token: 'OFFICE-ADMIN-SECRET' });
  clientUser.client_id = client._id;
  await clientUser.save();
  clientId = client._id.toString();

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  adminToken = (await login('domingo@example.test', PASSWORD)).body.token;
  const started = await login('cliente@example.test', PASSWORD);
  clientToken = (
    await verify(started.body.challenge_id, codeFrom(provider.email.mock.calls.at(-1)[0].html))
  ).body.token;
}, 120000);

beforeEach(() => {
  provider.email.mockReset().mockResolvedValue({ data: { id: 'email-1' }, error: null });
  webhooks.length = 0;
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

function cryptoRandom() {
  return new Uint8Array(32).map((_, index) => (index * 17 + 3) % 256);
}

describe('acceso de clientes con segundo factor', () => {
  it('mantiene el acceso de Domingo en un solo paso y no envía código', async () => {
    const response = await login('domingo@example.test', PASSWORD);
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.requires_otp).toBeUndefined();
    expect(provider.email).not.toHaveBeenCalled();
  });

  it('no revela si la contraseña falló enviando un código', async () => {
    const response = await login('cliente@example.test', 'clave-incorrecta');
    expect(response.status).toBe(401);
    expect(provider.email).not.toHaveBeenCalled();
  });

  it('exige el código de 6 dígitos, lo invalida al usarlo y abre el portal', async () => {
    const started = await login('cliente@example.test', PASSWORD);
    expect(started.status).toBe(200);
    expect(started.body.token).toBeUndefined();
    expect(started.body.requires_otp).toBe(true);
    expect(started.headers.get('cache-control')).toContain('no-store');
    const code = codeFrom(provider.email.mock.calls.at(-1)[0].html);
    expect(provider.email.mock.calls.at(-1)[0].subject).toBe('Tu código de acceso a Diginode');

    const wrong = await verify(started.body.challenge_id, code === '000000' ? '111111' : '000000');
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('ratelimit-limit')).toBeTruthy();

    const verified = await verify(started.body.challenge_id, code);
    expect(verified.status).toBe(200);
    expect(verified.body.token).toEqual(expect.any(String));
    expect(verified.body.user.role).toBe('client');

    const reused = await verify(started.body.challenge_id, code);
    expect(reused.status).toBe(401);

    const portal = await request('/api/portal/me', { token: verified.body.token });
    expect(portal.status).toBe(200);
  });

  it('bloquea el desafío a los cinco intentos y rechaza un código caducado', async () => {
    const started = await login('cliente@example.test', PASSWORD);
    const code = codeFrom(provider.email.mock.calls.at(-1)[0].html);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await verify(started.body.challenge_id, wrong)).status).toBe(401);
    }
    expect((await verify(started.body.challenge_id, code)).status).toBe(401);

    const fresh = await login('cliente@example.test', PASSWORD);
    const freshCode = codeFrom(provider.email.mock.calls.at(-1)[0].html);
    await OtpChallenge.updateOne(
      { challenge_id: fresh.body.challenge_id },
      { $set: { expires_at: new Date(Date.now() - 1000) } }
    );
    expect((await verify(fresh.body.challenge_id, freshCode)).status).toBe(401);
  });

  it('al reenviar invalida el código anterior', async () => {
    const started = await login('cliente@example.test', PASSWORD);
    const oldCode = codeFrom(provider.email.mock.calls.at(-1)[0].html);
    const resent = await request('/api/auth/otp/resend', {
      method: 'POST',
      body: { challenge_id: started.body.challenge_id },
    });
    expect(resent.status).toBe(200);
    const newCode = codeFrom(provider.email.mock.calls.at(-1)[0].html);
    expect(newCode).not.toBe(oldCode);
    expect((await verify(started.body.challenge_id, oldCode)).status).toBe(401);
    expect((await verify(resent.body.challenge_id, newCode)).status).toBe(200);
  });

  it('puede desactivarse con CLIENT_2FA_REQUIRED=false', async () => {
    process.env.CLIENT_2FA_REQUIRED = 'false';
    try {
      const response = await login('cliente@example.test', PASSWORD);
      expect(response.status).toBe(200);
      expect(response.body.token).toEqual(expect.any(String));
      expect(provider.email).not.toHaveBeenCalled();
    } finally {
      process.env.CLIENT_2FA_REQUIRED = 'true';
    }
  });
});

describe('claves de bot', () => {
  it('limita el alcance y deja de valer al revocarse', async () => {
    const created = await request('/api/agency/keys', {
      method: 'POST',
      token: adminToken,
      body: { name: 'lector', scopes: ['leads:read'] },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.key.startsWith('dnk_')).toBe(true);
    const key = created.body.data.key;

    expect((await request('/api/agency/leads', { key })).status).toBe(200);
    expect(
      (
        await request('/api/agency/leads', {
          method: 'POST',
          key,
          body: { business: 'Taller Sur' },
        })
      ).status
    ).toBe(403);

    expect(
      (
        await request('/api/agency/keys/' + created.body.data.id, {
          method: 'DELETE',
          token: adminToken,
        })
      ).status
    ).toBe(200);
    expect((await request('/api/agency/leads', { key })).status).toBe(401);
    expect((await request('/api/agency/keys', { key })).status).toBe(401);
  });
});

describe('pipeline, aprobación en dos fases y avisos cortos', () => {
  it('recorre Domingo, rechazo del cliente y una segunda aprobación', async () => {
    const keyResponse = await request('/api/agency/keys', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'bot-contenido',
        scopes: [
          'leads:read',
          'leads:write',
          'pieces:read',
          'pieces:write',
          'approvals:read',
          'approvals:write',
          'clients:read',
          'snapshot:read',
          'events:read',
        ],
      },
    });
    const key = keyResponse.body.data.key;

    const lead = await request('/api/agency/leads', {
      method: 'POST',
      key,
      body: {
        business: 'Floristería Luna',
        source: 'manual',
        links: [{ label: 'Instagram', url: 'https://instagram.com/luna' }],
      },
    });
    expect(lead.status).toBe(201);
    expect(lead.body.data.business).toBe('Floristería Luna');
    expect(lead.body.data.pipeline_status).toBe('nuevo');
    expect(lead.body.data.chat_history).toBeUndefined();

    expect(
      (
        await request('/api/agency/leads', {
          method: 'POST',
          key,
          body: { business: 'X', pipeline_status: 'ganado ya' },
        })
      ).status
    ).toBe(400);

    const activity = await request(`/api/agency/leads/${lead.body.data._id}/activity`, {
      method: 'POST',
      key,
      body: {
        type: 'mensaje_enviado',
        summary: 'Primer mensaje corto',
        next_action: 'Esperar respuesta',
        next_action_at: '2026-11-02T10:00:00.000Z',
      },
    });
    expect(activity.status).toBe(200);
    expect(activity.body.data.next_action).toBe('Esperar respuesta');
    expect(activity.body.data.activity.at(-1).summary).toBe('Primer mensaje corto');
    expect((await request('/api/agency/leads', { token: clientToken })).status).toBe(403);

    await request(`/api/agency/clients/${clientId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        service_package: 'Redes mensuales',
        account_manager_bot: 'bot-contenido',
        brand: {
          name: 'Norte',
          voice: 'cercana',
          sector: 'cafetería',
          city: 'Madrid',
          notes: 'NOTE-INTERNA',
        },
        strategy_links: [
          { label: 'Estrategia', url: 'https://docs.google.com/document/d/estrategia' },
        ],
        kpis: [{ name: 'alcance', value: 1200, unit: 'cuentas', period: '2026-10' }],
      },
    });

    const piece = await request('/api/agency/pieces', {
      method: 'POST',
      key,
      body: {
        client_id: clientId,
        type: 'post',
        title: 'Post de marzo',
        drive_url: DRIVE,
        note: 'v1',
      },
    });
    expect(piece.status).toBe(201);
    const pieceId = piece.body.data._id;

    const archived = await request('/api/agency/pieces', {
      method: 'POST',
      token: adminToken,
      body: { client_id: clientId, type: 'story', title: 'Archivada' },
    });
    await request(`/api/agency/pieces/${archived.body.data._id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'archivado' },
    });

    const submitted = await request(`/api/agency/pieces/${pieceId}/submit`, {
      method: 'POST',
      key,
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.status).toBe('pendiente_domingo');
    const approvalId = submitted.body.data._id;

    expect(
      (
        await request(`/api/agency/approvals/${approvalId}/client`, {
          method: 'POST',
          token: clientToken,
          body: { decision: 'aprobar' },
        })
      ).status
    ).toBe(409);
    expect(
      (
        await request(`/api/agency/approvals/${approvalId}/domingo`, {
          method: 'POST',
          key,
          body: { decision: 'aprobar' },
        })
      ).status
    ).toBe(403);

    const domingo = await request(`/api/agency/approvals/${approvalId}/domingo`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'aprobar' },
    });
    expect(domingo.body.data.status).toBe('pendiente_cliente');

    const rejected = await request(`/api/agency/approvals/${approvalId}/client`, {
      method: 'POST',
      token: clientToken,
      body: { decision: 'rechazar', comment: COMMENT },
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('devuelto');
    expect(rejected.body.data.audit.map((entry) => entry.action)).toEqual([
      'enviada',
      'aprobada_domingo',
      'rechazada_cliente',
    ]);

    const pieceAfter = await request(`/api/agency/pieces/${pieceId}`, { key });
    expect(pieceAfter.body.data.status).toBe('borrador');

    const notice = webhooks.map((item) => JSON.stringify(item.body)).join('\n');
    expect(notice).not.toContain(COMMENT);
    expect(notice).not.toContain('SECRETFILETOKEN');
    const slack = webhooks.filter((item) => item.url.includes('slack.test'));
    expect(slack.length).toBeGreaterThan(0);
    for (const item of slack) {
      expect(item.body.text).not.toContain('\n');
      expect(item.body.text).toContain('https://midiginode.com/agencia/aprobaciones/');
    }

    const version = await request(`/api/agency/pieces/${pieceId}/versions`, {
      method: 'POST',
      key,
      body: { note: 'corregido', drive_url: 'https://docs.google.com/document/d/version-2' },
    });
    expect(version.body.data.version).toBe(2);

    const again = await request(`/api/agency/pieces/${pieceId}/submit`, { method: 'POST', key });
    expect(again.body.data.status).toBe('pendiente_domingo');
    expect(again.body.data.round).toBe(2);

    await request(`/api/agency/approvals/${approvalId}/domingo`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'aprobar' },
    });
    const approved = await request(`/api/agency/approvals/${approvalId}/client`, {
      method: 'POST',
      token: clientToken,
      body: { decision: 'aprobar', comment: 'Adelante' },
    });
    expect(approved.body.data.status).toBe('aprobado');
    expect((await request(`/api/agency/pieces/${pieceId}`, { key })).body.data.status).toBe(
      'aprobado'
    );

    const events = await request('/api/agency/events', { token: adminToken });
    expect(events.body.data.some((event) => event.event === 'approval.status_changed')).toBe(true);

    const snapshot = await request(`/api/agency/clients/${clientId}/snapshot`, { key });
    expect(snapshot.status).toBe(200);
    const raw = JSON.stringify(snapshot.body);
    expect(snapshot.body.data.brand).toMatchObject({
      name: 'Norte',
      voice: 'cercana',
      city: 'Madrid',
    });
    expect(snapshot.body.data.strategy_links[0].url).toContain('docs.google.com');
    expect(snapshot.body.data.kpis[0]).toMatchObject({ name: 'alcance', value: '1200' });
    expect(snapshot.body.data.active_pieces.map((item) => item.title)).toContain('Post de marzo');
    expect(snapshot.body.data.active_pieces.map((item) => item.title)).not.toContain('Archivada');
    expect(raw).not.toContain('NOTE-INTERNA');
    expect(raw).not.toContain('SLACK-BOT-SECRET');
    expect(raw).not.toContain('OFFICE-ADMIN-SECRET');
    expect(
      (await request(`/api/agency/clients/${clientId}/snapshot`, { token: clientToken })).status
    ).toBe(200);
  });

  it('un rechazo de Domingo también devuelve la pieza al bot', async () => {
    const piece = await request('/api/agency/pieces', {
      method: 'POST',
      token: adminToken,
      body: { client_id: clientId, lead_id: undefined, type: 'reel', title: 'Reel corto' },
    });
    const submitted = await request(`/api/agency/pieces/${piece.body.data._id}/submit`, {
      method: 'POST',
      token: adminToken,
    });
    const rejected = await request(`/api/agency/approvals/${submitted.body.data._id}/domingo`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'rechazar', comment: 'Falta el local' },
    });
    expect(rejected.body.data.status).toBe('devuelto');
    expect(JSON.stringify(webhooks)).not.toContain('Falta el local');
    expect(
      (
        await request(`/api/agency/approvals/${submitted.body.data._id}/client`, {
          method: 'POST',
          token: adminToken,
          body: { decision: 'aprobar' },
        })
      ).status
    ).toBe(403);
  });
});

describe('caja fuerte', () => {
  it('cifra con AES-256-GCM, descifra solo por el canal autorizado y deja rastro', async () => {
    const encoded = encrypt_secret('secreto-local');
    expect(encoded.ciphertext).not.toContain('secreto-local');
    expect(decrypt_secret(encoded)).toBe('secreto-local');
    expect(() =>
      decrypt_secret({ ...encoded, auth_tag: Buffer.alloc(16, 7).toString('base64') })
    ).toThrow(/descifrar/);

    const created = await request(`/api/agency/clients/${clientId}/credentials`, {
      method: 'POST',
      token: clientToken,
      body: {
        provider: 'meta_business',
        label: 'Instagram de Norte',
        secret: { username: 'norte', password: VAULT_PASSWORD },
      },
    });
    expect(created.status).toBe(201);
    const credentialId = created.body.data.id;

    const list = await request(`/api/agency/clients/${clientId}/credentials`, {
      token: clientToken,
    });
    expect(JSON.stringify(list.body)).not.toContain(VAULT_PASSWORD);
    expect(list.body.data[0]).toMatchObject({
      provider: 'meta_business',
      label: 'Instagram de Norte',
    });
    expect(list.body.data[0].ciphertext).toBeUndefined();

    expect(
      (
        await request(`/api/agency/credentials/${credentialId}/decrypt`, {
          method: 'POST',
          token: clientToken,
        })
      ).status
    ).toBe(403);

    const opened = await request(`/api/agency/credentials/${credentialId}/decrypt`, {
      method: 'POST',
      token: adminToken,
    });
    expect(opened.status).toBe(200);
    expect(opened.body.data.secret.password).toBe(VAULT_PASSWORD);
    expect(opened.headers.get('cache-control')).toContain('no-store');

    await Credential.updateOne(
      { _id: credentialId },
      { $set: { auth_tag: Buffer.alloc(16, 9).toString('base64') } }
    );
    const broken = await request(`/api/agency/credentials/${credentialId}/decrypt`, {
      method: 'POST',
      token: adminToken,
    });
    expect(broken.status).toBe(422);
    expect(JSON.stringify(broken.body)).not.toContain(VAULT_PASSWORD);

    const audit = await request(`/api/agency/clients/${clientId}/credential-audit`, {
      token: adminToken,
    });
    expect(audit.body.data.map((row) => row.action)).toEqual(
      expect.arrayContaining(['create', 'read', 'read_failed'])
    );
    expect(JSON.stringify(audit.body)).not.toContain(VAULT_PASSWORD);
  });
});

describe('factura Stripe, informes y borrado RGPD', () => {
  it('crea el enlace de pago y el webhook marca la factura pagada solo si el importe coincide', async () => {
    const ids = [];
    vi.spyOn(stripe.checkout.sessions, 'create').mockImplementation(async () => {
      const id = `cs_test_agency_${ids.length + 1}`;
      ids.push(id);
      return { id, url: `https://checkout.stripe.test/c/${id}` };
    });

    const invoice = await request('/api/agency/invoices', {
      method: 'POST',
      token: adminToken,
      body: { client_id: clientId, concept: 'Gestión marzo', amount_eur: 150.5 },
    });
    expect(invoice.status).toBe(201);
    const checkout = await request(`/api/agency/invoices/${invoice.body.data._id}/checkout`, {
      method: 'POST',
      token: adminToken,
    });
    expect(checkout.body.data.url).toContain('checkout.stripe.test');

    await handle_stripe_event({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkout.body.data.session_id,
          amount_total: 15050,
          currency: 'eur',
          metadata: {
            type: 'agency_invoice',
            invoice_id: invoice.body.data._id,
            client_id: clientId,
          },
          customer_details: { email: 'payer@example.test', name: 'Pagador' },
        },
      },
    });
    await handle_stripe_event({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkout.body.data.session_id,
          amount_total: 15050,
          currency: 'eur',
          metadata: {
            type: 'agency_invoice',
            invoice_id: invoice.body.data._id,
            client_id: clientId,
          },
        },
      },
    });

    const paid = await Invoice.findById(invoice.body.data._id);
    expect(paid.status).toBe('pagada');
    expect(await Payment.countDocuments({ stripe_session_id: checkout.body.data.session_id })).toBe(
      1
    );

    const other = await request('/api/agency/invoices', {
      method: 'POST',
      token: adminToken,
      body: { client_id: clientId, concept: 'Importe raro', amount_eur: 80 },
    });
    const otherCheckout = await request(`/api/agency/invoices/${other.body.data._id}/checkout`, {
      method: 'POST',
      token: adminToken,
    });
    await handle_stripe_event({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: otherCheckout.body.data.session_id,
          amount_total: 100,
          currency: 'eur',
          metadata: {
            type: 'agency_invoice',
            invoice_id: other.body.data._id,
            client_id: clientId,
          },
        },
      },
    });
    expect((await Invoice.findById(other.body.data._id)).status).toBe('revision');

    const report = await request('/api/agency/reports', {
      method: 'POST',
      token: adminToken,
      body: {
        client_id: clientId,
        period: '2026-10',
        title: 'Informe octubre',
        drive_url: 'https://docs.google.com/document/d/informe-octubre',
      },
    });
    expect(report.status).toBe(201);
    const meeting = await request('/api/agency/meetings', {
      method: 'POST',
      token: adminToken,
      body: {
        client_id: clientId,
        title: 'Revisión mensual',
        starts_at: '2026-11-03T09:00:00.000Z',
      },
    });
    expect(meeting.status).toBe(201);
    expect((await request('/api/agency/reports', { token: clientToken })).body.data).toHaveLength(
      1
    );
  });

  it('exporta y borra los datos personales de un lead y de un cliente', async () => {
    const lead = await request('/api/agency/leads', {
      method: 'POST',
      token: adminToken,
      body: {
        business: 'Persona Borrable',
        name: 'Ana',
        email: 'ana@example.test',
        phone: '600111222',
      },
    });
    const exported = await request(`/api/agency/privacy/leads/${lead.body.data._id}`, {
      token: adminToken,
    });
    expect(exported.body.data.email).toBe('ana@example.test');
    expect(exported.headers.get('content-disposition')).toContain('lead-');

    expect(
      (
        await request(`/api/agency/privacy/leads/${lead.body.data._id}`, {
          method: 'DELETE',
          token: adminToken,
        })
      ).status
    ).toBe(200);
    const after = await request(`/api/agency/privacy/leads/${lead.body.data._id}`, {
      token: adminToken,
    });
    expect(after.body.data.email).toBeNull();
    expect(after.body.data.name).toBeNull();
    expect(after.body.data.business).toBeNull();
    expect(after.body.data.contact_id.startsWith('erased_')).toBe(true);

    const fresh = await request('/api/agency/clients', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Cliente Borrable', email: 'borrable@example.test', company: 'Su negocio' },
    });
    const freshId = fresh.body.data._id;
    await request(`/api/agency/clients/${freshId}/portal-access`, {
      method: 'POST',
      token: adminToken,
    });
    await request(`/api/agency/clients/${freshId}/credentials`, {
      method: 'POST',
      token: adminToken,
      body: { provider: 'web', label: 'Web', secret: { password: 'web-secret-que-no-sale' } },
    });
    await Payment.create({
      client_id: freshId,
      amount: 40,
      payer_email: 'borrable@example.test',
      payer_name: 'Cliente Borrable',
      description: 'Anticipo',
      type: 'invoice',
    });

    const pack = await request(`/api/agency/privacy/clients/${freshId}`, { token: adminToken });
    expect(pack.body.data.email).toBe('borrable@example.test');
    expect(pack.body.data.credentials[0].label).toBe('Web');
    expect(JSON.stringify(pack.body)).not.toContain('web-secret-que-no-sale');

    const erased = await request(`/api/agency/privacy/clients/${freshId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(erased.body.data.erased).toBe(true);
    const stored = await Client.findById(freshId);
    expect(stored.name).toBe('Cliente eliminado');
    expect(stored.email).not.toBe('borrable@example.test');
    expect(await Credential.countDocuments({ client_id: freshId })).toBe(0);
    const payment = await Payment.findOne({ client_id: freshId });
    expect(payment.amount).toBe(40);
    expect(payment.payer_email).toBeUndefined();
    expect((await login('borrable@example.test', 'no-importa')).status).toBe(401);
  });
});

describe('límite de intentos de acceso', () => {
  it('corta una ráfaga de contraseñas incorrectas', async () => {
    let blocked = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await login('domingo@example.test', `incorrecta-${attempt}`);
      if (response.status === 429) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});
