import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { randomUUID } from 'node:crypto';

const provider = vi.hoisted(() => ({ email: vi.fn(), notifications: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: provider.email };
  },
}));
vi.mock('../src/services/ops_notify_service.js', () => ({
  notify_ops: provider.notifications,
  notify_office_requested: provider.notifications,
}));

import app from '../src/app.js';
import Lead from '../src/models/lead_model.js';
import User from '../src/models/user_model.js';
import Proposal from '../src/models/proposal_model.js';
import Payment from '../src/models/payment_model.js';
import { stripe } from '../src/services/stripe_service.js';
import { sign_token } from '../src/utils/jwt_utils.js';
import { PRIVACY_VERSION } from '../src/config/services.js';
import { suggest_price } from '../src/services/pricing_service.js';

let mongo, server, base, adminToken;
async function request(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function webhook(session) {
  const payload = JSON.stringify({ id: 'evt_' + randomUUID(), type: 'checkout.session.completed', data: { object: session } });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return fetch(base + '/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const admin = await User.create({
    email: 'admin-proposals@example.test',
    full_name: 'Admin',
    password_hash: 'x',
    role: 'admin',
    is_active: true,
  });
  adminToken = sign_token({ user_id: admin._id.toString(), role: 'admin', token_version: 0 });
  provider.email.mockResolvedValue({ data: { id: 'email' }, error: null });
  provider.notifications.mockResolvedValue({ ok: true });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 120000);
afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('questionnaire, versioned proposals and payment as acceptance', () => {
  it('suggests prices by scale, scope and region', () => {
    expect(suggest_price('brand_management', { employees: '3-5', locations: '1' })).toMatchObject({
      currency: 'EUR',
      monthly: 890,
      setup: 490,
    });
    expect(suggest_price('brand_management', { employees: '11-20' }).monthly).toBe(1890);
    expect(suggest_price('brand_management', { employees: '3-5', country: 'MX' })).toMatchObject({
      currency: 'USD',
      monthly: 590,
    });
    expect(suggest_price('web_project', { web_goals: ['contact'] })).toMatchObject({ one_time: 1900 });
  });

  it('stores the questionnaire with a suggested price and rejects unknown answers', async () => {
    const body = {
      request_id: randomUUID(),
      name: 'Gerente',
      company: 'Distribuciones Ejemplo',
      email: 'gerente@example.test',
      phone: '+34 600 000 000',
      service_interest: 'brand_management',
      goal: '',
      landing_path: '/',
      privacy_version: PRIVACY_VERSION,
      privacy_acknowledged: true,
      questionnaire: {
        sector: 'distribution',
        employees: '6-10',
        locations: '1',
        revenue: '150k-500k',
        country: 'ES',
        reasons: ['no_results'],
        channels: ['instagram', 'google'],
        marketing_spend: '500-1500',
        new_clients: '6-20',
      },
    };
    expect((await request('/api/leads', { method: 'POST', body })).status).toBe(201);
    const lead = await Lead.findOne({ request_id: body.request_id });
    expect(lead.suggested_price).toMatchObject({ monthly: 890, currency: 'EUR' });
    const invalid = { ...body, request_id: randomUUID(), questionnaire: { employees: '7' } };
    expect((await request('/api/leads', { method: 'POST', body: invalid })).status).toBe(400);
  });

  it('only the latest version can be paid, and only the exact amount accepts it', async () => {
    const lead = await Lead.findOne({ email: 'gerente@example.test' });
    const input = {
      service: 'brand_management',
      currency: 'EUR',
      vat_rate: 21,
      items: [{ label: 'Departamento de marketing', detail: 'Redes, anuncios y web' }],
      monthly: 990,
      setup: 490,
      send_email: true,
    };
    expect((await request(`/api/admin/leads/${lead._id}/proposals`, { method: 'POST', body: input })).status).toBe(401);
    const first = await request(`/api/admin/leads/${lead._id}/proposals`, {
      method: 'POST',
      body: input,
      token: adminToken,
    });
    expect(first.status).toBe(201);
    expect(first.body.data.emailed).toBe(true);
    const second = await request(`/api/admin/leads/${lead._id}/proposals`, {
      method: 'POST',
      body: { ...input, monthly: 890 },
      token: adminToken,
    });
    const oldToken = first.body.data.proposal.url.split('/').pop();
    const token = second.body.data.proposal.url.split('/').pop();
    expect((await request(`/api/proposals/${oldToken}`)).body.data.status).toBe('superseded');
    expect((await request(`/api/proposals/${oldToken}/checkout`, { method: 'POST' })).status).toBe(409);

    const view = (await request(`/api/proposals/${token}`)).body.data;
    expect(view.amounts).toEqual({ first: 166980, monthly: 107690, setup: 59290 });
    const create = vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ id: 'cs_proposal', url: 'https://checkout.stripe.test/p' });
    const checkout = await request(`/api/proposals/${token}/checkout`, { method: 'POST' });
    expect(checkout.body.url).toBe('https://checkout.stripe.test/p');
    const params = create.mock.calls[0][0];
    expect(params.mode).toBe('subscription');
    expect(params.line_items.map((item) => item.price_data.unit_amount)).toEqual([107690, 59290]);
    expect(params.metadata.type).toBe('proposal');

    const proposal = await Proposal.findOne({ token });
    const session = {
      id: 'cs_proposal',
      amount_total: 100,
      currency: 'eur',
      customer_details: { email: 'gerente@example.test' },
      metadata: { type: 'proposal', proposal_id: String(proposal._id) },
    };
    expect((await webhook(session)).status).toBe(200);
    expect((await Proposal.findById(proposal._id)).status).toBe('sent');

    expect((await webhook({ ...session, id: 'cs_proposal_ok', amount_total: 166980 })).status).toBe(200);
    expect((await webhook({ ...session, id: 'cs_proposal_ok', amount_total: 166980 })).status).toBe(200);
    expect((await Proposal.findById(proposal._id)).status).toBe('paid');
    expect((await Lead.findById(lead._id)).status).toBe('won');
    expect(await Payment.countDocuments({ stripe_session_id: 'cs_proposal_ok' })).toBe(1);
    expect((await request(`/api/proposals/${token}/checkout`, { method: 'POST' })).status).toBe(409);
    expect(
      (await request(`/api/admin/leads/${lead._id}/proposals`, { method: 'POST', body: input, token: adminToken })).status
    ).toBe(409);
  });

  it('charges only the first instalment of a web project', async () => {
    const lead = await Lead.create({
      contact_id: 'request-web',
      platform: 'website',
      email: 'web@example.test',
      company: 'Restaurante Ejemplo',
    });
    const created = await request(`/api/admin/leads/${lead._id}/proposals`, {
      method: 'POST',
      token: adminToken,
      body: {
        service: 'web_project',
        currency: 'USD',
        vat_rate: 0,
        items: [{ label: 'Web con reservas' }],
        total: 2000,
        due_now: 800,
      },
    });
    const token = created.body.data.proposal.url.split('/').pop();
    const create = vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ id: 'cs_web', url: 'https://checkout.stripe.test/w' });
    await request(`/api/proposals/${token}/checkout`, { method: 'POST' });
    const params = create.mock.calls.at(-1)[0];
    expect(params.mode).toBe('payment');
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'usd', unit_amount: 80000 });
  });
});
