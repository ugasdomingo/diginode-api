import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const provider = vi.hoisted(() => ({ email: vi.fn(), ai: vi.fn(), notifications: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider.email };
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: provider.ai };
  },
}));
vi.mock('../src/services/ops_notify_service.js', () => ({
  notify_ops: provider.notifications,
  notify_office_requested: provider.notifications,
}));

import app from '../src/app.js';
import Lead from '../src/models/lead_model.js';
import User from '../src/models/user_model.js';
import Client from '../src/models/client_model.js';
import Knowledge from '../src/models/knowledge_model.js';
import DemoAction from '../src/models/demo_action_model.js';
import DemoQuota from '../src/models/demo_quota_model.js';
import Payment from '../src/models/payment_model.js';
import { stripe } from '../src/services/stripe_service.js';
import { sign_token } from '../src/utils/jwt_utils.js';
import { SERVICES, PRIVACY_VERSION } from '../src/config/services.js';
import { PLANS } from '../src/config/plans.js';
import { NORA_DEMO_KB } from '../src/config/nora_kb.js';
import { capture_lead, retry_lead_notifications } from '../src/services/lead_capture_service.js';
import { prepare_demo_email } from '../src/services/demo_email_service.js';
import {
  acquire_demo,
  release_demo,
  reserve_quota,
  daily_key,
} from '../src/services/demo_guard_service.js';
import { run_followups } from '../src/services/followup_service.js';
import { handle_meeting_booked } from '../src/services/crm_service.js';
import { demo_message_schema } from '../src/schemas/demo_schema.js';
import { lead_schema } from '../src/schemas/lead_schema.js';

let mongo,
  server,
  base,
  adminToken,
  clientToken,
  ip = 1;
const review = process.env.PUBLIC_REVIEW_SERVER === 'true';
const payload = (overrides) => ({
  request_id: randomUUID(),
  name: 'Contacto de prueba',
  company: 'Empresa de prueba',
  email: 'contacto@example.test',
  service_interest: 'brand_management',
  requested_scale: 'micro',
  goal: 'Ordenar la comunicación y atender las consultas',
  budget_range: 'pending',
  landing_path: '/',
  website: '',
  privacy_version: PRIVACY_VERSION,
  privacy_acknowledged: true,
  honeypot: '',
  ...overrides,
});
async function request(path, { method = 'GET', body, token, address } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': address || `192.0.2.${(ip++ % 240) + 1}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
function aiReply(params) {
  const last = params.messages.at(-1).content;
  const system =
    typeof params.system === 'string'
      ? params.system
      : params.system.map((block) => block.text).join('\n');
  const result = (content) => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 50, output_tokens: 20 },
  });
  if (Array.isArray(last)) {
    const tool = JSON.parse(last[0].content);
    if (tool.pending_action)
      return result(
        'He preparado el resumen. Revisa destinatario y contenido y confirma el envío con el botón. Aún no se ha enviado.'
      );
    if (tool.simulated)
      return result(
        'Agenda ficticia de ejemplo: lunes a las 09:00, consulta de ejemplo. No he reservado ninguna cita.'
      );
    return result(tool.error || tool.message || tool.summary);
  }
  if (/agenda/i.test(last))
    return {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'agenda-test', name: 'agenda_semana', input: {} }],
      usage: { input_tokens: 50, output_tokens: 20 },
    };
  if (/correo|email/i.test(last)) {
    const email = last.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
    if (email)
      return {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'email-test',
            name: 'enviar_correo',
            input: { to_email: email, asunto: 'Ignorado', cuerpo: 'Contenido arbitrario ignorado' },
          },
        ],
        usage: { input_tokens: 50, output_tokens: 20 },
      };
    return result(
      '¿A qué dirección quieres preparar el resumen? Después tendrás que revisar y confirmar el envío.'
    );
  }
  if (system.includes('Contexto inicial: marca'))
    return result(
      'Podemos ordenar tu marca y marketing. Para microempresa o pyme acordamos prioridades y presupuesto: propuesta según tu operación. ¿Qué te gustaría mejorar?'
    );
  if (system.includes('Contexto inicial: un proceso'))
    return result(
      'Podemos definir una web, catálogo o aplicación con alcance y validación acordados. ¿Qué proceso necesita tu equipo?'
    );
  return result(
    `La Clínica Digital incluye web y tres empleados IA por ${PLANS.clinica.monthly} EUR/mes. ¿Qué tarea administrativa quieres mejorar en tu consulta?`
  );
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('diginode_public_test'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  const password_hash = await bcrypt.hash('local-review-only', 4);
  const admin = await User.create({
    email: 'admin@example.test',
    full_name: 'Admin local',
    password_hash,
    role: 'admin',
    is_active: true,
  });
  const clientUser = await User.create({
    email: 'client@example.test',
    full_name: 'Cliente local',
    password_hash,
    role: 'client',
    is_active: true,
  });
  const client = await Client.create({
    user_id: clientUser._id,
    email: clientUser.email,
    name: 'Cliente local',
    plan: 'clinica',
    status: 'active',
  });
  clientUser.client_id = client._id;
  await clientUser.save();
  adminToken = sign_token({ user_id: admin._id.toString(), role: 'admin', token_version: 0 });
  clientToken = sign_token({
    user_id: clientUser._id.toString(),
    role: 'client',
    token_version: 0,
  });
  await Knowledge.create({ key: 'nora_demo', content: NORA_DEMO_KB });
  vi.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue({
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  });
  server = app.listen(review ? 3107 : 0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 120000);
beforeEach(() => {
  provider.email.mockReset().mockResolvedValue({ data: { id: 'email-simulated' }, error: null });
  provider.ai.mockReset().mockImplementation(async (params) => aiReply(params));
  provider.notifications.mockReset().mockResolvedValue({ ok: false });
});
afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

describe.skipIf(review)('public repositioning — HTTP and real ephemeral MongoDB', () => {
  it('serves three services without unapproved prices and preserves the clinic catalogue', async () => {
    const services = await request('/api/services');
    expect(services.body.data.services).toEqual(SERVICES);
    expect(services.body.data.services[0]).not.toHaveProperty('monthly');
    const plans = await request('/api/plans');
    expect(plans.body.data.plans.find((plan) => plan.role === 'flagship').monthly).toBe(
      PLANS.clinica.monthly
    );
  });
  it('validates lengths, budgets, privacy, HTTP URLs and demo namespace', () => {
    for (const override of [
      { email: 'wrong' },
      { name: '' },
      { goal: 'short' },
      { website: 'javascript:alert(1)' },
      { website: 'not-a-url' },
      { budget_range: 'project_over_10000' },
      { privacy_acknowledged: false },
    ])
      expect(lead_schema.safeParse(payload(override)).success).toBe(false);
    expect(
      demo_message_schema.parse({ contact_id: 'demo-legacy123456', message: 'Hola' }).context
    ).toBe('clinic');
    for (const input of [
      { contact_id: '34600000000', message: 'Hola' },
      { contact_id: 'demo-12345678', platform: 'whatsapp', message: 'Hola' },
      { contact_id: 'demo-12345678', context: 'system prompt', message: 'Hola' },
    ])
      expect(demo_message_schema.safeParse(input).success).toBe(false);
  });
  it('captures before notifying; concurrent identical requests create one lead and retry the failed notification', async () => {
    const input = lead_schema.parse(payload({ company: 'Idempotencia local' }));
    const results = await Promise.all(Array.from({ length: 5 }, () => capture_lead(input)));
    expect(results.every((result) => result.request_id === input.request_id)).toBe(true);
    expect(await Lead.countDocuments({ request_id: input.request_id })).toBe(1);
    let saved = await Lead.findOne({ request_id: input.request_id });
    expect(saved.source).toBe('web_form');
    expect(saved.notification_status).toBe('pending');
    expect(saved.funnel_stage).toBe('request_received');
    expect(saved.marketing_authorized_at).toBeUndefined();
    await expect(
      capture_lead({ ...input, goal: 'Un contenido diferente al recibido' })
    ).rejects.toMatchObject({ status_code: 409 });
    provider.notifications.mockResolvedValue({ ok: true });
    await retry_lead_notifications();
    saved = await Lead.findOne({ request_id: input.request_id });
    expect(saved.notification_status).toBe('sent');
  });
  it('rejects stale privacy, spam and oversized bodies without creating a request', async () => {
    for (const override of [
      { privacy_version: 'old' },
      { website: 'not-a-url' },
      { honeypot: 'spam' },
      { goal: 'a'.repeat(9000) },
    ])
      expect(
        (await request('/api/leads', { method: 'POST', body: payload(override) })).status
      ).toBeGreaterThanOrEqual(400);
  });
  it('finds requests in admin using real search and filters, saves notes and coherent status, blocks agency auto-conversion', async () => {
    const result = await request(
      '/api/admin/leads?search=Idempotencia&source=web_form&service_interest=brand_management',
      { token: adminToken }
    );
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(1);
    const id = result.body.data[0]._id;
    const updated = await request('/api/admin/leads/' + id, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'won', internal_notes: 'Contrato revisado en test' },
    });
    expect(updated.body.data.funnel_stage).toBe('won');
    expect(
      (await request('/api/admin/leads/' + id + '/convert', { method: 'POST', token: adminToken }))
        .status
    ).toBe(409);
    expect((await request('/api/admin/leads?search=%5B.*', { token: adminToken })).status).toBe(
      200
    );
    expect((await request('/api/admin/leads')).status).toBe(401);
    expect((await request('/api/admin/leads', { token: clientToken })).status).toBe(403);
  });
  it('uses three Nora contexts and simulated agenda; retains one history and meters demo tokens', async () => {
    const contact_id = 'demo-' + randomUUID();
    for (const [context, expected] of [
      ['agency', 'marca'],
      ['web', 'aplicación'],
      ['clinic', 'Clínica'],
    ]) {
      const result = await request('/api/demo/message', {
        method: 'POST',
        body: {
          contact_id,
          context,
          message: '¿Cómo puedes ayudar a mi negocio?',
          supports_confirmation: true,
        },
      });
      expect(result.status).toBe(200);
      expect(result.body.reply).toContain(expected);
      expect(result.body.actions[0].href).toBe(
        context === 'web'
          ? '/webs-y-aplicaciones#contacto'
          : context === 'clinic'
            ? '/clinica-digital#contacto'
            : '/#contacto'
      );
    }
    const agenda = await request('/api/demo/message', {
      method: 'POST',
      body: { contact_id, message: 'Enséñame la agenda' },
    });
    expect(agenda.body.reply).toContain('ficticia');
    const lead = await Lead.findOne({ contact_id });
    expect(lead.chat_history).toHaveLength(8);
    expect(lead.demo_turns).toBe(4);
    expect((await DemoQuota.findById(daily_key())).input_tokens).toBeGreaterThan(0);
    expect(provider.email).not.toHaveBeenCalled();
  });
  it('prepares fixed summary, confirms once, locks recipient and enforces expiry and destination quota across IDs', async () => {
    const recipient = 'confirm@example.test',
      contact_id = 'demo-' + randomUUID();
    const result = await request('/api/demo/message', {
      method: 'POST',
      body: {
        contact_id,
        context: 'agency',
        message: 'Prepara correo para ' + recipient,
        supports_confirmation: true,
      },
    });
    expect(result.body.pending_action.recipient).toBe(recipient);
    expect(result.body.pending_action.summary).not.toContain('Contenido arbitrario');
    expect(provider.email).not.toHaveBeenCalled();
    const action_id = result.body.pending_action.id;
    expect(
      (
        await request('/api/demo/confirm-email', {
          method: 'POST',
          body: { contact_id: 'demo-other12345', action_id },
        })
      ).status
    ).toBe(404);
    const confirm = await Promise.all(
      [1, 2].map(() =>
        request('/api/demo/confirm-email', {
          method: 'POST',
          body: { contact_id, action_id, recipient: 'attacker@example.test' },
        })
      )
    );
    expect(confirm.every((response) => response.status === 200)).toBe(true);
    expect(provider.email).toHaveBeenCalledTimes(1);
    expect(provider.email.mock.calls[0][0].to).toBe(recipient);
    expect(
      (
        await request('/api/demo/confirm-email', {
          method: 'POST',
          body: { contact_id, action_id },
        })
      ).body.status
    ).toBe('sent');
    const expired = await DemoAction.create({
      _id: randomUUID(),
      contact_id,
      recipient,
      summary: 'Resumen',
      expires_at: new Date(Date.now() - 1000),
    });
    expect(
      (
        await request('/api/demo/confirm-email', {
          method: 'POST',
          body: { contact_id, action_id: expired._id },
        })
      ).status
    ).toBe(410);
    for (let count = 0; count < 2; count++) {
      const other = 'demo-' + randomUUID();
      await Lead.create({ contact_id: other, platform: 'website', email: recipient });
      const pending = await prepare_demo_email(
        await Lead.findOne({ contact_id: other }),
        recipient,
        'web',
        true
      );
      expect(
        (
          await request('/api/demo/confirm-email', {
            method: 'POST',
            body: { contact_id: other, action_id: pending.pending_action.id },
          })
        ).status
      ).toBe(count === 0 ? 200 : 429);
    }
  });
  it('reports email provider failure without claiming delivery or retrying the same confirmation', async () => {
    const contact_id = 'demo-' + randomUUID(), recipient = 'failure@example.test';
    const lead = await Lead.create({ contact_id, platform: 'website', email: recipient });
    expect((await prepare_demo_email(lead, 'unrequested@example.test', 'agency', true)).error).toBeTruthy();
    const prepared = await prepare_demo_email(lead, recipient, 'agency', true);
    provider.email.mockResolvedValue({ data: null, error: { message: 'simulated rejection' } });
    const result = await request('/api/demo/confirm-email', { method: 'POST', body: { contact_id, action_id: prepared.pending_action.id } });
    expect(result.status).toBe(503); expect(result.body.success).toBe(false);
    expect((await DemoAction.findById(prepared.pending_action.id)).status).toBe('failed');
    expect((await request('/api/demo/confirm-email', { method: 'POST', body: { contact_id, action_id: prepared.pending_action.id } })).status).toBe(409);
    expect(provider.email).toHaveBeenCalledTimes(1);
  });
  it('keeps old widgets conversational without sending, handles provider failure and does not enable followups', async () => {
    const contact_id = 'demo-' + randomUUID();
    const old = await request('/api/demo/message', {
      method: 'POST',
      body: { contact_id, message: 'Prepara correo para legacy@example.test' },
    });
    expect(old.status).toBe(200);
    expect(old.body.pending_action).toBeUndefined();
    expect(provider.email).not.toHaveBeenCalled();
    expect(await run_followups()).toBe(0);
    expect(provider.email).not.toHaveBeenCalled();
    provider.ai.mockRejectedValueOnce(new Error('simulated provider failure'));
    const failure = await request('/api/demo/message', {
      method: 'POST',
      body: { contact_id, message: 'Hola otra vez' },
    });
    expect(failure.status).toBe(500);
    expect(failure.body.success).toBe(false);
    expect((await Lead.findOne({ contact_id })).demo_lock_token).toBeUndefined();
  });
  it('enforces atomic limits and one concurrent turn, including after reconnecting MongoDB', async () => {
    const lead = await Lead.create({
      contact_id: 'demo-' + randomUUID(),
      platform: 'website',
      source: 'demo_whatsapp',
      demo_turns: 14,
    });
    const lock = await acquire_demo(lead);
    expect(lock).toBeTruthy();
    expect(await acquire_demo(lead)).toBeNull();
    await release_demo(lead._id, lock);
    await mongoose.disconnect();
    await mongoose.connect(mongo.getUri('diginode_public_test'));
    expect(await acquire_demo(await Lead.findById(lead._id))).toBeNull();
    const another = await Lead.create({
      contact_id: 'demo-' + randomUUID(),
      platform: 'website',
      source: 'demo_whatsapp',
    });
    const token = await acquire_demo(another);
    await expect(acquire_demo(another)).rejects.toMatchObject({ status_code: 409 });
    await release_demo(another._id, token);
    const quota = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserve_quota('atomic-test', 3, new Date(Date.now() + 86400000))
      )
    );
    expect(quota.filter(Boolean)).toHaveLength(3);
    await DemoQuota.updateOne(
      { _id: daily_key() },
      { $set: { count: Number(process.env.DEMO_DAILY_LIMIT || 300) } }
    );
    await expect(acquire_demo(another)).rejects.toMatchObject({ status_code: 429 });
    await DemoQuota.updateOne({ _id: daily_key() }, { $set: { count: 50 } });
  });
  it('associates verified bookings only by exact email, leaves ambiguous matches for human review', async () => {
    await Lead.create({
      contact_id: 'booking-source-test',
      platform: 'website',
      email: 'booking@example.test',
      name: 'Similar name',
    });
    const booked = await handle_meeting_booked({
      booking_id: 'booking-test-1',
      attendee_email: 'booking@example.test',
      attendee_name: 'Different name',
    });
    const newBooking = await handle_meeting_booked({ booking_id: 'booking-without-lead', attendee_email: 'new-booking@example.test' });
    expect(newBooking.funnel_stage).toBe('meeting_booked');
    expect(booked.status).toBe('meeting_booked');
    expect(booked.funnel_stage).toBe('meeting_booked');
    await Lead.create({
      contact_id: 'booking-source-test-2',
      platform: 'website',
      email: 'booking@example.test',
    });
    expect(
      await handle_meeting_booked({
        booking_id: 'ambiguous',
        attendee_email: 'booking@example.test',
        attendee_name: 'Similar name',
      })
    ).toBeNull();
    expect(
      (await Lead.findOne({ contact_id: 'booking-source-test-2' })).booking_review_ids
    ).toContain('ambiguous');
    expect(await handle_meeting_booked({ attendee_email: 'booking@example.test' })).toBeNull();
  });
  it('separates received requests, actual demos, verified meetings and won contracts; keeps workshop analytics', async () => {
    const result = await request('/api/admin/funnel', { token: adminToken });
    expect(result.body.data.requests_received).toBe(
      await Lead.countDocuments({ source: 'web_form' })
    );
    expect(result.body.data.demos_started).toBe(
      await Lead.countDocuments({ source: 'demo_whatsapp' })
    );
    expect(result.body.data.contracts_won).toBeGreaterThan(0);
    expect(result.body.data.meetings_confirmed).toBeGreaterThan(0);
    const stats = await request('/api/admin/analytics', { token: adminToken });
    expect(stats.body.data).toHaveProperty('landing_funnel');
    expect(stats.body.data).toHaveProperty('business_funnel');
  });
  it('preserves clinic checkout amount and configurable return, leaves payment truth in signed webhook', async () => {
    const create = vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'http://localhost:3000/__test/checkout' });
    process.env.CLINICA_RETURN_PATH = '/clinica-digital';
    const result = await request('/api/clinica/checkout', { method: 'POST' });
    expect(result.status).toBe(200);
    const params = create.mock.calls[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(PLANS.clinica.monthly * 100);
    expect(params.success_url).toContain('/clinica-digital?compra=pendiente');
    process.env.CLINICA_RETURN_PATH = '/';
    await request('/api/clinica/checkout', { method: 'POST' });
    expect(create.mock.calls[1][0].success_url).toContain('/?compra=pendiente');
    create.mockRestore();
    expect(
      (
        await request('/api/webhooks/stripe', {
          method: 'POST',
          body: { type: 'checkout.session.completed' },
        })
      ).status
    ).toBe(400);
    expect(await Payment.countDocuments()).toBe(0);
    const event = {
      id: 'evt_test_signed',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_signed',
          mode: 'subscription',
          metadata: { type: 'clinica' },
          payment_status: 'paid',
          amount_total: PLANS.clinica.monthly * 100,
          currency: 'eur',
          customer: 'cus_test',
          subscription: 'sub_test',
          customer_details: { email: 'signed@example.test', name: 'Signed test' },
        },
      },
    };
    const raw = JSON.stringify(event),
      signature = stripe.webhooks.generateTestHeaderString({
        payload: raw,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });
    const send = () =>
      fetch(base + '/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
        body: raw,
      });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect(await Payment.countDocuments({ stripe_session_id: 'cs_test_signed' })).toBe(1);
    expect((await Client.findOne({ email: 'signed@example.test' })).plan).toBe('clinica');
    expect(provider.email).toHaveBeenCalledTimes(1);
  });
  it('preserves training catalogue and authenticated client portal', async () => {
    expect((await request('/api/trainings/ia-para-terapeutas')).status).toBe(200);
    expect((await request('/api/portal/me', { token: clientToken })).status).toBe(200);
    expect((await request('/api/portal/plan', { token: clientToken })).status).toBe(200);
  });
  it('returns failure when Mongo persistence fails, never a false receipt', async () => {
    const input = payload();
    const failure = vi
      .spyOn(Lead, 'create')
      .mockRejectedValueOnce(new Error('simulated database failure'));
    const result = await request('/api/leads', { method: 'POST', body: input });
    expect(result.status).toBe(500);
    expect(result.body.success).toBe(false);
    expect(await Lead.countDocuments({ request_id: input.request_id })).toBe(0);
    failure.mockRestore();
  });
  it('compares and backs up editable knowledge, refuses stale hash, then applies reviewed content', async () => {
    const run = promisify(execFile);
    const env = { ...process.env, NORA_KB_REVIEW_URI: mongo.getUri('diginode_public_test') };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diginode-kb-test-'));
    const original = 'Contenido personalizado por administración';
    await Knowledge.updateOne({ key: 'nora_demo' }, { $set: { content: original } });
    const current_hash = createHash('sha256').update(original).digest('hex');
    const comparison = await run(process.execPath, ['scripts/update_nora_kb.js'], { env });
    expect(JSON.parse(comparison.stdout).current_hash).toBe(current_hash);
    await expect(
      run(
        process.execPath,
        ['scripts/update_nora_kb.js', '--apply=stale', '--backup=' + path.join(dir, 'stale.json')],
        { env }
      )
    ).rejects.toThrow();
    expect((await Knowledge.findOne({ key: 'nora_demo' })).content).toBe(original);
    await run(
      process.execPath,
      [
        'scripts/update_nora_kb.js',
        '--apply=' + current_hash,
        '--backup=' + path.join(dir, 'reviewed.json'),
      ],
      { env }
    );
    expect(
      JSON.parse(await fs.readFile(path.join(dir, 'reviewed.json'), 'utf8')).document.content
    ).toBe(original);
    expect((await Knowledge.findOne({ key: 'nora_demo' })).content).toBe(NORA_DEMO_KB);
    await fs.unlink(path.join(dir, 'stale.json'));
    await fs.unlink(path.join(dir, 'reviewed.json'));
    await fs.rmdir(dir);
  }, 30000);
  it('rate limits public form bursts by IP', async () => {
    const address = '198.51.100.42';
    const results = [];
    for (let i = 0; i < 9; i++)
      results.push(
        await request('/api/leads', {
          method: 'POST',
          address,
          body: payload({ email: `limit${i}@example.test` }),
        })
      );
    expect(results.at(-1).status).toBe(429);
  });
});

it.skipIf(!review)(
  'local public review server with isolated data and simulated providers',
  async () => {
    const sessions = new Map();
    vi.spyOn(stripe.checkout.sessions, 'create').mockImplementation(async (params) => {
      const id = 'cs_test_' + randomUUID();
      sessions.set(id, params);
      return { id, url: `${base}/__test/checkout/${id}` };
    });
    app.get('/__test/checkout.js', (_req, res) =>
      res
        .type('application/javascript')
        .send(
          "document.querySelector('form').addEventListener('submit', async event => {\n  event.preventDefault();\n  const form = event.currentTarget, button = form.querySelector('button');\n  button.disabled = true;\n  try {\n    const response = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' } });\n    const data = await response.json();\n    if (!response.ok || !data.return_url) throw new Error('simulated checkout failed');\n    location.assign(data.return_url);\n  } catch { button.disabled = false; document.querySelector('#result').textContent = 'No se pudo confirmar el pago simulado.'; }\n});"
        )
    );
    app.get('/__test/checkout/:id', (req, res) => {
      if (!sessions.has(req.params.id)) return res.status(404).end();
      res.send(
        '<h1>Checkout simulado de Clínica Digital</h1><p>Entorno local: no se realiza ningún cobro.</p><form method="post" action="/__test/complete/' +
          req.params.id +
          '"><button>Confirmar pago simulado</button></form><p id="result" role="status"></p><script src="/__test/checkout.js" defer></script>'
      );
    });
    app.post('/__test/complete/:id', async (req, res, next) => {
      try {
        const params = sessions.get(req.params.id);
        if (!params) return res.status(404).end();
        const event = {
          id: 'evt_test_' + req.params.id,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: req.params.id,
              mode: 'subscription',
              metadata: { type: 'clinica' },
              payment_status: 'paid',
              amount_total: PLANS.clinica.monthly * 100,
              currency: 'eur',
              customer: 'cus_test_' + req.params.id,
              subscription: 'sub_test_' + req.params.id,
              customer_details: { email: 'buyer@example.test', name: 'Compra simulada' },
            },
          },
        };
        const raw = JSON.stringify(event),
          signature = stripe.webhooks.generateTestHeaderString({
            payload: raw,
            secret: process.env.STRIPE_WEBHOOK_SECRET,
          });
        const response = await fetch(base + '/api/webhooks/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
          body: raw,
        });
        if (!response.ok) return res.status(500).send('Webhook de prueba falló');
        if (req.get('Accept') === 'application/json')
          return res.json({ return_url: params.success_url });
        res.redirect(params.success_url);
      } catch (err) {
        next(err);
      }
    });
    console.log(
      'LOCAL_REVIEW_READY http://127.0.0.1:3107 — admin@example.test / client@example.test — password local-review-only. Mongo ephemeral; AI, mail, Slack and checkout simulated.'
    );
    // Remains available for browser review; Ctrl+C terminates the test process.
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  },
  3600000
);
