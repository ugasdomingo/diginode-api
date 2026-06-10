import Stripe from 'stripe';
import { randomBytes } from 'crypto';
import { PLANS, AI_PLAN_SLUGS } from '../config/plans.js';
import Client, { PLAN_EMPLOYEES } from '../models/client_model.js';
import User from '../models/user_model.js';
import Package from '../models/package_model.js';
import PackageSubscription from '../models/package_subscription_model.js';
import Payment from '../models/payment_model.js';
import { send_welcome_email, send_suspension_email } from './email_service.js';
import { notify_office_requested } from './ops_notify_service.js';

// ── Empleados AI pricing ────────────────────────────────────────────────────
// Derived from the single source of truth (config/plans.js) — keep no prices here.
const AI_PLANS = Object.fromEntries(
  AI_PLAN_SLUGS.map((slug) => [slug, {
    monthly: PLANS[slug].monthly,
    setup:   PLANS[slug].setup,
    name:    PLANS[slug].name,
  }])
);

// Employee display names for receipts / emails
const EMPLOYEE_NAMES = {
  recepcionista:    'Nora',
  asistente:        'Alex',
  'gestor-relaciones': 'Marcos',
  'content-manager':   'Valeria',
};

// ── Bolsa de Empleo pricing (mirrors frontend constants) ────────────────────
const BOLSA_NAMES = {
  sofia: 'Sofía', marcos: 'Marcos', luna: 'Luna',
  valeria: 'Valeria', elena: 'Elena', maya: 'Maya',
};
const BOLSA_VALID_IDS   = Object.keys(BOLSA_NAMES);
const BOLSA_ALL_IDS     = BOLSA_VALID_IDS;
const BOLSA_INDIVIDUAL  = { setup: 600 };
const BOLSA_DEPARTMENTS = [
  { members: ['sofia', 'marcos'], setup: 750 },
  { members: ['luna', 'valeria'], setup: 750 },
  { members: ['elena', 'maya'],   setup: 750 },
];
const BOLSA_FULL_TEAM = { setup: 1950 };

const BOLSA_TO_COMMERCIAL_EMPLOYEE = {
  luna: 'recepcionista',
  sofia: 'asistente',
  valeria: 'content-manager',
  marcos: 'gestor-relaciones',
};

const OFFICE_PACKAGE_CONFIG = {
  'despacho-digital': {
    plan: 'operativo',
    employees: ['recepcionista', 'asistente'],
    monthly: 300,
  },
  'clinica-digital': {
    plan: 'full',
    employees: ['recepcionista', 'asistente', 'content-manager', 'gestor-relaciones'],
    monthly: 500,
  },
};

const office_plan_for_employee_count = (count) => {
  if (count >= 4) return 'full';
  if (count >= 2) return 'operativo';
  return 'individual';
};

// Returns the setup fee for a given selection (same logic as frontend)
const calculate_bolsa_setup = (ids) => {
  if (ids.length === BOLSA_ALL_IDS.length && BOLSA_ALL_IDS.every(id => ids.includes(id))) {
    return BOLSA_FULL_TEAM.setup;
  }

  let remaining = [...ids];
  let total = 0;

  for (const dept of BOLSA_DEPARTMENTS) {
    if (dept.members.every(m => remaining.includes(m))) {
      total += dept.setup;
      remaining = remaining.filter(m => !dept.members.includes(m));
    }
  }

  total += remaining.length * BOLSA_INDIVIDUAL.setup;
  return total;
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Amount-contrast guard (defense-in-depth) ────────────────────────────────
// The webhook dispatches fulfillment by session.metadata.type. As a second line
// of defense, an activation handler verifies that the amount Stripe actually
// charged matches what that product should cost, so a session crafted to trigger
// a more valuable fulfillment than was paid for is rejected instead of fulfilled.
const charged_eur = (session) => (session.amount_total ?? 0) / 100;

const amount_mismatch = (session, expected_eur) =>
  expected_eur == null || Math.abs(charged_eur(session) - expected_eur) >= 0.01;

// Records the payment flagged for manual review and skips product activation.
const flag_amount_mismatch = async (session, { type, label, expected_eur }) => {
  console.error(
    `[stripe] amount mismatch on ${type} session ${session.id}: ` +
    `charged ${charged_eur(session)} EUR, expected ${expected_eur} EUR — activation skipped`
  );
  const existing = await Payment.findOne({ stripe_session_id: session.id });
  if (existing) return;
  await Payment.create({
    payer_email:              session.customer_details?.email,
    payer_name:               session.customer_details?.name,
    stripe_session_id:        session.id,
    stripe_payment_intent_id: session.payment_intent ?? undefined,
    amount:                   charged_eur(session),
    currency:                 (session.currency ?? 'eur').toUpperCase(),
    description:              `[REVISAR IMPORTE] ${label}`,
    type,
    reference_slug:           'review',
    reference_label:          label,
  });
};

// ── Shared helpers ──────────────────────────────────────────────────────────

// Generates a cryptographically-secure temporary password (~16 chars, URL-safe).
const generate_temp_password = () => randomBytes(12).toString('base64url');

// Fetches the Stripe receipt URL for a PaymentIntent.
// Returns null if unavailable — never throws.
const get_receipt_url = async (payment_intent_id) => {
  if (!payment_intent_id) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id, {
      expand: ['latest_charge'],
    });
    return pi.latest_charge?.receipt_url ?? null;
  } catch {
    return null;
  }
};

// Ensures a Client + User account exists for the given email.
// Handles all cases:
//   - New email:               creates Client + User, sends welcome email
//   - Client exists, no User:  creates User, sends welcome email
//   - Both exist:              returns existing client, skips email
//   - User exists, no client:  creates Client, links User
const ensure_account = async ({ email, full_name, plan }) => {
  if (!email) return null;

  let client = await Client.findOne({ email });

  if (!client) {
    client = await Client.create({ name: full_name, email, plan, status: 'active' });
  }

  const existing_user = await User.findOne({ email });

  if (!existing_user) {
    const temp_password = generate_temp_password();
    const password_hash = await User.hash_password(temp_password);
    await User.create({
      email,
      password_hash,
      role:                     'client',
      client_id:                client._id,
      password_change_required: true,
    });
    await send_welcome_email(email, { name: full_name, temp_password });
  } else if (!existing_user.client_id) {
    // Edge case: user exists but was never linked to a client record
    await User.findByIdAndUpdate(existing_user._id, { client_id: client._id });
  }

  return client;
};

// ── Checkout session creators ───────────────────────────────────────────────

const create_course_checkout_session = async ({ course_slug, course_title, amount }) => {
  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'eur',
          product_data: { name: course_title },
          unit_amount:  Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/gracias?tipo=curso&slug=${course_slug}`,
    cancel_url:  `${base}/cursos/${course_slug}`,
    locale:      'es',
    metadata:    { type: 'course', course_slug, course_title },
  });

  return { url: session.url, session_id: session.id };
};

const create_despacho_checkout_session = async () => {
  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'eur',
          product_data: { name: 'Despacho Digital — Web + Panel + 2 Empleados IA' },
          unit_amount:  30000,
          recurring:    { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/gracias?tipo=despacho`,
    cancel_url:  `${base}/despacho-digital`,
    locale:      'es',
    metadata:    { type: 'package', package_slug: 'despacho-digital' },
  });

  return { url: session.url, session_id: session.id };
};

// ── Plan Entrepreneur (oferta insignia) ─────────────────────────────────────
// Default active employees: Alex (asistente) + Nora (recepcionista). The 2nd is
// refined during onboarding. Office plan = operativo (2 employees).
const ENTREPRENEUR_EMPLOYEES = ['asistente', 'recepcionista'];

// Subscription checkout at a flat 300€/mes. Uses inline price_data (consistent
// with the despacho/clinica flows) so no pre-created Stripe Price IDs are needed.
const create_entrepreneur_checkout_session = async () => {
  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'eur',
          product_data: { name: 'Plan Entrepreneur — Web + Panel + 2 Empleados IA' },
          unit_amount:  PLANS.entrepreneur.monthly * 100,
          recurring:    { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url:          `${base}/gracias?tipo=entrepreneur`,
    cancel_url:           `${base}/plan`,
    locale:               'es',
    metadata:             { type: 'entrepreneur', package_slug: 'entrepreneur' },
    subscription_data:    { metadata: { plan: 'entrepreneur' } },
  });

  return { url: session.url, session_id: session.id };
};

const create_bolsa_checkout_session = async ({ employee_ids, installments = 1 }) => {
  const ids = [...new Set(employee_ids ?? [])].filter(id => BOLSA_VALID_IDS.includes(id));
  if (ids.length === 0) {
    const err = new Error('Selecciona al menos un empleado');
    err.status_code = 400;
    throw err;
  }

  const setup_total = calculate_bolsa_setup(ids);
  const amount      = installments === 3 ? Math.ceil(setup_total / 3) : setup_total;

  const names = ids.length === BOLSA_VALID_IDS.length
    ? 'Equipo Completo'
    : ids.map(id => BOLSA_NAMES[id]).join(', ');

  const description = installments === 3
    ? `Bolsa de Empleo IA — ${names} (cuota 1/3)`
    : `Bolsa de Empleo IA — ${names}`;

  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'eur',
          product_data: { name: description },
          unit_amount:  Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/gracias?tipo=bolsa`,
    cancel_url:  `${base}/bolsa-de-empleo`,
    locale:      'es',
    metadata: {
      type:              'bolsa',
      employee_ids:      ids.join(','),
      employee_label:    names,
      installments:      String(installments),
      installment_number: '1',
      setup_total:       String(setup_total),
    },
  });

  return { url: session.url, session_id: session.id };
};

const create_clinica_checkout_session = async () => {
  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'eur',
          product_data: { name: 'Clínica Digital — 4 Empleados IA + Panel de control' },
          unit_amount:  50000,
          recurring:    { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/gracias?tipo=despacho`,
    cancel_url:  `${base}/bolsa-de-empleo`,
    locale:      'es',
    metadata:    { type: 'package', package_slug: 'clinica-digital' },
  });

  return { url: session.url, session_id: session.id };
};

// ── AI Employee Plan checkout sessions ─────────────────────────────────────

// Creates a two-item checkout: setup fee (one-time) + monthly subscription.
// For 'individual' plan, caller passes the chosen employee_id.
const create_ai_plan_checkout_session = async ({ plan, employee_id = null }) => {
  const config = AI_PLANS[plan];
  if (!config) {
    const err = new Error('Plan no válido');
    err.status_code = 400;
    throw err;
  }

  // For individual plan, employee_id is required
  if (plan === 'individual' && !employee_id) {
    const err = new Error('Debes seleccionar un empleado para el plan Individual');
    err.status_code = 400;
    throw err;
  }

  const employee_ids = plan === 'individual'
    ? [employee_id]
    : PLAN_EMPLOYEES[plan];

  const employee_label = employee_ids
    .map(id => EMPLOYEE_NAMES[id] ?? id)
    .join(', ');

  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [
      // Setup fee — one-time charge added to the first invoice
      {
        price_data: {
          currency:     'eur',
          product_data: { name: `Setup — ${config.name} (${employee_label})` },
          unit_amount:  config.setup * 100,
          recurring:    { interval: 'month', interval_count: 1 },
        },
        quantity: 1,
      },
      // Monthly subscription
      {
        price_data: {
          currency:     'eur',
          product_data: { name: `${config.name} — ${employee_label}` },
          unit_amount:  config.monthly * 100,
          recurring:    { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      // Remove the setup item after the first billing cycle
      trial_settings: undefined,
      metadata: {
        plan,
        employee_ids: employee_ids.join(','),
      },
    },
    success_url: `${base}/gracias?tipo=empleado&plan=${plan}`,
    cancel_url:  `${base}/planes`,
    locale:      'es',
    metadata: {
      type:         'ai_plan',
      plan,
      employee_ids: employee_ids.join(','),
      employee_label,
      setup_amount: String(config.setup),
      monthly_amount: String(config.monthly),
    },
  });

  return { url: session.url, session_id: session.id };
};

const create_package_checkout_session = async ({ package_slug }) => {
  const pkg = await Package.findOne({ slug: package_slug, active: true });

  if (!pkg) {
    const err = new Error('Paquete no encontrado o no disponible');
    err.status_code = 404;
    throw err;
  }

  if (!pkg.stripe_price_id) {
    const err = new Error('Este paquete aún no está configurado para pagos');
    err.status_code = 503;
    throw err;
  }

  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items:           [{ price: pkg.stripe_price_id, quantity: 1 }],
    success_url:          `${base}/gracias?tipo=despacho`,
    cancel_url:           `${base}/despacho-digital`,
    locale:               'es',
    metadata:             { type: 'package', package_slug: pkg.slug },
  });

  return { url: session.url, session_id: session.id };
};

// Creates a manual Stripe Checkout Session (admin-issued payment link).
const create_manual_checkout_session = async ({ client_id, label, amount, installment_number = null, installment_total = null }) => {
  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'eur',
          product_data: { name: label },
          unit_amount:  Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/gracias?tipo=manual`,
    cancel_url:  `${base}/portal/dashboard`,
    locale:      'es',
    metadata: {
      type:               'manual',
      client_id:          String(client_id),
      label,
      installment_number: installment_number != null ? String(installment_number) : '',
      installment_total:  installment_total  != null ? String(installment_total)  : '',
    },
  });

  return { url: session.url, session_id: session.id };
};

// ── Webhook event router ────────────────────────────────────────────────────

const handle_stripe_event = async (event) => {
  switch (event.type) {
    case 'checkout.session.completed':
      await handle_checkout_completed(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handle_subscription_deleted(event.data.object);
      break;

    case 'invoice.payment_succeeded':
      await handle_invoice_succeeded(event.data.object);
      break;

    default:
      break;
  }
};

// ── Private event handlers ──────────────────────────────────────────────────

const handle_checkout_completed = async (session) => {
  const { type } = session.metadata ?? {};

  if (type === 'course')    await handle_course_checkout(session);
  else if (type === 'package')      await handle_package_checkout(session);
  else if (type === 'entrepreneur') await handle_entrepreneur_checkout(session);
  else if (type === 'bolsa')    await handle_bolsa_checkout(session);
  else if (type === 'manual')   await handle_manual_checkout(session);
  else if (type === 'ai_plan')  await handle_ai_plan_checkout(session);
};

// Plan Entrepreneur subscription — creates account + office, flat 300€/mes
const handle_entrepreneur_checkout = async (session) => {
  const stripe_subscription_id = session.subscription;
  const stripe_customer_id     = session.customer;
  const email                  = session.customer_details?.email;
  const full_name              = session.customer_details?.name ?? email;

  if (!stripe_subscription_id || !email) return;

  const existing = await PackageSubscription.findOne({ stripe_checkout_session_id: session.id });
  if (existing) return;

  // First invoice must equal the flat monthly fee.
  if (amount_mismatch(session, PLANS.entrepreneur.monthly)) {
    return flag_amount_mismatch(session, { type: 'subscription', label: 'Plan Entrepreneur', expected_eur: PLANS.entrepreneur.monthly });
  }

  const subscription = await stripe.subscriptions.retrieve(stripe_subscription_id);
  const started_at   = new Date(subscription.current_period_start * 1000);
  const next_billing = new Date(subscription.current_period_end   * 1000);

  const client = await ensure_account({ email, full_name, plan: 'entrepreneur' });

  await Client.findByIdAndUpdate(client._id, {
    active_employees:  ENTREPRENEUR_EMPLOYEES,
    setup_fee_paid:    true,
    onboarding_status: 'pending_form',
    office_status:     'requested',
    office_plan:       'operativo',
    status:            'active',
  });
  notify_office_requested({
    client: { _id: client._id, email, full_name },
    plan: 'operativo',
    employees: ENTREPRENEUR_EMPLOYEES,
    source: 'entrepreneur_checkout',
    amount: PLANS.entrepreneur.monthly,
    currency: 'EUR',
  }).catch(() => {});

  await PackageSubscription.create({
    client_id:                  client._id,
    package_slug:               'entrepreneur',
    stripe_subscription_id,
    stripe_customer_id,
    stripe_checkout_session_id: session.id,
    status:                     'active',
    started_at,
    next_billing_date:          next_billing,
    amount_monthly:             PLANS.entrepreneur.monthly,
  });

  let receipt_url = null;
  if (session.invoice) {
    try {
      const inv = await stripe.invoices.retrieve(session.invoice, { expand: ['charge'] });
      receipt_url = inv.charge?.receipt_url ?? inv.hosted_invoice_url ?? null;
    } catch { /* not critical */ }
  }

  await Payment.create({
    client_id:         client._id,
    payer_email:       email,
    payer_name:        full_name,
    stripe_session_id: session.id,
    amount:            (session.amount_total ?? 0) / 100,
    currency:          (session.currency ?? 'eur').toUpperCase(),
    description:       'Plan Entrepreneur — primer mes',
    type:              'subscription',
    reference_slug:    'entrepreneur',
    reference_label:   PLANS.entrepreneur.name,
    receipt_url,
  });
};

// Course one-time payment
const handle_course_checkout = async (session) => {
  const existing = await Payment.findOne({ stripe_session_id: session.id });
  if (existing) return;

  const email     = session.customer_details?.email;
  const full_name = session.customer_details?.name ?? email;
  const amount    = (session.amount_total ?? 0) / 100;
  const slug      = session.metadata?.course_slug ?? '';
  const label     = session.metadata?.course_title ?? slug;

  const client    = await ensure_account({ email, full_name, plan: 'course' });
  const receipt_url = await get_receipt_url(session.payment_intent);

  await Payment.create({
    client_id:                client?._id,
    payer_email:              email,
    payer_name:               full_name,
    stripe_session_id:        session.id,
    stripe_payment_intent_id: session.payment_intent ?? undefined,
    amount,
    currency:         (session.currency ?? 'eur').toUpperCase(),
    description:      `Curso: ${slug}`,
    type:             'course',
    reference_slug:   slug,
    reference_label:  label,
    receipt_url,
  });
};

// Bolsa de Empleo setup payment
const handle_bolsa_checkout = async (session) => {
  const existing = await Payment.findOne({ stripe_session_id: session.id });
  if (existing) return;

  const email        = session.customer_details?.email;
  const full_name    = session.customer_details?.name ?? email;
  const amount       = (session.amount_total ?? 0) / 100;
  const ids          = session.metadata?.employee_ids ?? '';
  const label        = session.metadata?.employee_label ?? ids;
  const installments = parseInt(session.metadata?.installments ?? '1', 10);
  const inst_number  = parseInt(session.metadata?.installment_number ?? '1', 10);

  // Contrast charged amount against the setup fee recorded at checkout creation.
  const setup_total  = parseInt(session.metadata?.setup_total ?? '0', 10);
  const expected     = installments === 3 ? Math.ceil(setup_total / 3) : setup_total;
  if (amount_mismatch(session, expected)) {
    return flag_amount_mismatch(session, { type: 'bolsa', label: `Bolsa de Empleo IA — ${label}`, expected_eur: expected });
  }

  const client      = await ensure_account({ email, full_name, plan: 'bolsa' });
  const receipt_url = await get_receipt_url(session.payment_intent);
  const active_employees = ids
    .map(id => BOLSA_TO_COMMERCIAL_EMPLOYEE[id])
    .filter(Boolean);

  if (client) {
    await Client.findByIdAndUpdate(client._id, {
      active_employees,
      setup_fee_paid: true,
      onboarding_status: 'pending_form',
      office_status: 'requested',
      office_plan: office_plan_for_employee_count(active_employees.length),
      status: 'active',
    });
    notify_office_requested({
      client: { _id: client._id, email, full_name },
      plan: office_plan_for_employee_count(active_employees.length),
      employees: active_employees,
      source: 'bolsa_checkout',
      amount,
      currency: (session.currency ?? 'eur').toUpperCase(),
    }).catch(() => {});
  }

  await Payment.create({
    client_id:                client?._id,
    payer_email:              email,
    payer_name:               full_name,
    stripe_session_id:        session.id,
    stripe_payment_intent_id: session.payment_intent ?? undefined,
    amount,
    currency:          (session.currency ?? 'eur').toUpperCase(),
    description:       `Bolsa de Empleo IA — ${label}`,
    type:              'bolsa',
    reference_slug:    'bolsa',
    reference_label:   label,
    receipt_url,
    installment_number: installments > 1 ? inst_number  : null,
    installment_total:  installments > 1 ? installments : null,
  });
};

// Package subscription — creates account + subscription record
const handle_package_checkout = async (session) => {
  const stripe_subscription_id = session.subscription;
  const stripe_customer_id     = session.customer;
  const email                  = session.customer_details?.email;
  const full_name              = session.customer_details?.name ?? email;
  const package_slug           = session.metadata?.package_slug;

  if (!stripe_subscription_id || !email || !package_slug) return;

  const existing = await PackageSubscription.findOne({ stripe_checkout_session_id: session.id });
  if (existing) return;

  // For office packages with a fixed published price, contrast the first invoice
  // against it. Generic packages price from their Stripe price id (trusted) → skip.
  const office_config = OFFICE_PACKAGE_CONFIG[package_slug];
  if (office_config && amount_mismatch(session, office_config.monthly)) {
    return flag_amount_mismatch(session, { type: 'subscription', label: `Suscripción ${package_slug}`, expected_eur: office_config.monthly });
  }

  const subscription  = await stripe.subscriptions.retrieve(stripe_subscription_id);
  const started_at    = new Date(subscription.current_period_start * 1000);
  const next_billing  = new Date(subscription.current_period_end   * 1000);
  const amount_monthly = (subscription.items.data[0]?.price?.unit_amount ?? 0) / 100;

  const pkg = await Package.findOne({ slug: package_slug });
  const minimum_end_date = new Date(started_at);
  minimum_end_date.setMonth(minimum_end_date.getMonth() + (pkg?.minimum_months ?? 6));

  const client = await ensure_account({ email, full_name, plan: 'despacho-digital' });

  if (office_config) {
    await Client.findByIdAndUpdate(client._id, {
      active_employees: office_config.employees,
      setup_fee_paid: true,
      onboarding_status: 'pending_form',
      office_status: 'requested',
      office_plan: office_config.plan,
      status: 'active',
    });
    notify_office_requested({
      client: { _id: client._id, email, full_name },
      plan: office_config.plan,
      employees: office_config.employees,
      source: `package_checkout:${package_slug}`,
      amount: (session.amount_total ?? 0) / 100,
      currency: (session.currency ?? 'eur').toUpperCase(),
    }).catch(() => {});
  }

  await PackageSubscription.create({
    client_id:                  client._id,
    package_slug,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_checkout_session_id: session.id,
    status:                     'active',
    started_at,
    minimum_end_date,
    next_billing_date:          next_billing,
    amount_monthly,
  });

  // Receipt from the subscription invoice
  let receipt_url = null;
  if (session.invoice) {
    try {
      const inv = await stripe.invoices.retrieve(session.invoice, { expand: ['charge'] });
      receipt_url = inv.charge?.receipt_url ?? inv.hosted_invoice_url ?? null;
    } catch { /* not critical */ }
  }

  await Payment.create({
    client_id:         client._id,
    payer_email:       email,
    payer_name:        full_name,
    stripe_session_id: session.id,
    amount:            (session.amount_total ?? 0) / 100,
    currency:          (session.currency ?? 'eur').toUpperCase(),
    description:       `Suscripción ${pkg?.name ?? package_slug} — primer mes`,
    type:              'subscription',
    reference_slug:    package_slug,
    reference_label:   pkg?.name ?? package_slug,
    receipt_url,
    installment_number: null,
    installment_total:  null,
  });
};

// Admin-issued manual payment link
const handle_manual_checkout = async (session) => {
  const existing = await Payment.findOne({ stripe_session_id: session.id });
  if (existing) return;

  const client_id        = session.metadata?.client_id;
  const label            = session.metadata?.label ?? 'Pago manual';
  const inst_number_str  = session.metadata?.installment_number;
  const inst_total_str   = session.metadata?.installment_total;
  const amount           = (session.amount_total ?? 0) / 100;
  const receipt_url      = await get_receipt_url(session.payment_intent);

  await Payment.create({
    client_id:                client_id ?? undefined,
    payer_email:              session.customer_details?.email,
    payer_name:               session.customer_details?.name,
    stripe_session_id:        session.id,
    stripe_payment_intent_id: session.payment_intent ?? undefined,
    amount,
    currency:          (session.currency ?? 'eur').toUpperCase(),
    description:       label,
    type:              'manual',
    reference_slug:    'manual',
    reference_label:   label,
    receipt_url,
    installment_number: inst_number_str ? parseInt(inst_number_str, 10) : null,
    installment_total:  inst_total_str  ? parseInt(inst_total_str,  10) : null,
  });
};

// AI Employee Plan — creates account, sets active employees, marks setup paid
const handle_ai_plan_checkout = async (session) => {
  const existing = await PackageSubscription.findOne({ stripe_checkout_session_id: session.id });
  if (existing) return;

  const stripe_subscription_id = session.subscription;
  const stripe_customer_id     = session.customer;
  const email                  = session.customer_details?.email;
  const full_name              = session.customer_details?.name ?? email;
  const plan                   = session.metadata?.plan;
  const employee_ids           = (session.metadata?.employee_ids ?? '').split(',').filter(Boolean);
  const employee_label         = session.metadata?.employee_label ?? '';
  const monthly_amount         = parseFloat(session.metadata?.monthly_amount ?? '0');

  if (!stripe_subscription_id || !email || !plan) return;

  // First invoice charges setup + first month (both line items recur monthly).
  const plan_config = AI_PLANS[plan];
  const expected    = plan_config ? plan_config.setup + plan_config.monthly : null;
  if (amount_mismatch(session, expected)) {
    return flag_amount_mismatch(session, { type: 'subscription', label: `Plan ${plan}`, expected_eur: expected });
  }

  const subscription  = await stripe.subscriptions.retrieve(stripe_subscription_id);
  const started_at    = new Date(subscription.current_period_start * 1000);
  const next_billing  = new Date(subscription.current_period_end   * 1000);

  const client = await ensure_account({ email, full_name, plan });

  // Activate the contracted employees and mark onboarding as started
  await Client.findByIdAndUpdate(client._id, {
    active_employees:   employee_ids,
    setup_fee_paid:     true,
    onboarding_status:  'pending_form',
    office_status:      'requested',
    office_plan:        office_plan_for_employee_count(employee_ids.length),
    status:             'active',
  });
  notify_office_requested({
    client: { _id: client._id, email, full_name },
    plan: office_plan_for_employee_count(employee_ids.length),
    employees: employee_ids,
    source: `ai_plan_checkout:${plan}`,
    amount: monthly_amount,
    currency: 'EUR',
  }).catch(() => {});

  await PackageSubscription.create({
    client_id:                  client._id,
    package_slug:               `empleado-${plan}`,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_checkout_session_id: session.id,
    status:                     'active',
    started_at,
    next_billing_date:          next_billing,
    amount_monthly:             monthly_amount,
  });

  let receipt_url = null;
  if (session.invoice) {
    try {
      const inv = await stripe.invoices.retrieve(session.invoice, { expand: ['charge'] });
      receipt_url = inv.charge?.receipt_url ?? inv.hosted_invoice_url ?? null;
    } catch { /* not critical */ }
  }

  await Payment.create({
    client_id:         client._id,
    payer_email:       email,
    payer_name:        full_name,
    stripe_session_id: session.id,
    amount:            (session.amount_total ?? 0) / 100,
    currency:          (session.currency ?? 'eur').toUpperCase(),
    description:       `Plan ${plan} — ${employee_label} (setup + primer mes)`,
    type:              'subscription',
    reference_slug:    `empleado-${plan}`,
    reference_label:   `Plan ${AI_PLANS[plan]?.name ?? plan}`,
    receipt_url,
  });
};

// Subscription cancelled in Stripe
const handle_subscription_deleted = async (subscription) => {
  const sub = await PackageSubscription.findOneAndUpdate(
    { stripe_subscription_id: subscription.id },
    { status: 'canceled' },
    { new: true }
  );
  if (!sub) return;

  const client = await Client.findByIdAndUpdate(sub.client_id, { status: 'suspended' }, { new: true });
  if (client) await send_suspension_email(client.email, { name: client.name });
};

// Renewal invoice paid — records the payment, updates next billing date, reactivates if suspended
const handle_invoice_succeeded = async (invoice) => {
  if (!invoice.subscription || invoice.billing_reason === 'subscription_create') return;

  const sub = await PackageSubscription.findOne({ stripe_subscription_id: invoice.subscription });
  if (!sub) return;

  // Update next billing date from Stripe's period_end
  const next_billing_date = invoice.period_end
    ? new Date(invoice.period_end * 1000)
    : null;

  await PackageSubscription.findByIdAndUpdate(sub._id, {
    ...(next_billing_date && { next_billing_date }),
    status: 'active',
  });

  await Client.findOneAndUpdate(
    { _id: sub.client_id, status: 'suspended' },
    { status: 'active' }
  );

  // Receipt from invoice charge
  let receipt_url = null;
  try {
    const full_invoice = await stripe.invoices.retrieve(invoice.id, { expand: ['charge'] });
    receipt_url = full_invoice.charge?.receipt_url ?? full_invoice.hosted_invoice_url ?? null;
  } catch { /* not critical */ }

  await Payment.create({
    client_id:    sub.client_id,
    amount:       (invoice.amount_paid ?? 0) / 100,
    currency:     (invoice.currency ?? 'eur').toUpperCase(),
    description:  `Renovación ${sub.package_slug}`,
    type:         'subscription',
    reference_slug:  sub.package_slug,
    reference_label: sub.package_slug,
    receipt_url,
  });
};

export {
  create_course_checkout_session,
  create_package_checkout_session,
  create_despacho_checkout_session,
  create_entrepreneur_checkout_session,
  create_clinica_checkout_session,
  create_bolsa_checkout_session,
  create_manual_checkout_session,
  create_ai_plan_checkout_session,
  handle_stripe_event,
  AI_PLANS,
  EMPLOYEE_NAMES,
};
