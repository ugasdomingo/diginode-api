import Stripe from 'stripe';
import { randomBytes } from 'crypto';
import { PLANS, CLINICA_EMPLOYEES } from '../config/plans.js';
import Client from '../models/client_model.js';
import User from '../models/user_model.js';
import PackageSubscription from '../models/package_subscription_model.js';
import Payment from '../models/payment_model.js';
import { send_welcome_email, send_suspension_email } from './email_service.js';
import { notify_office_requested } from './ops_notify_service.js';

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

// Clínica Digital — the only public product. Flat monthly subscription, no
// setup fee and no trial (first month is charged immediately). Uses inline
// price_data so no pre-created Stripe Price IDs are needed.
const create_clinica_checkout_session = async () => {
  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'eur',
          product_data: { name: `${PLANS.clinica.name} — Página web + 3 Empleados IA` },
          unit_amount:  PLANS.clinica.monthly * 100,
          recurring:    { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url:       `${base}/?compra=ok`,
    cancel_url:        `${base}/`,
    locale:            'es',
    metadata:          { type: 'clinica' },
    subscription_data: { metadata: { plan: 'clinica' } },
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
    success_url: `${base}/portal/dashboard`,
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

  if (type === 'clinica')     await handle_clinica_checkout(session);
  else if (type === 'manual') await handle_manual_checkout(session);
};

// Clínica Digital subscription — creates account + office with the 3 employees.
const handle_clinica_checkout = async (session) => {
  const stripe_subscription_id = session.subscription;
  const stripe_customer_id     = session.customer;
  const email                  = session.customer_details?.email;
  const full_name              = session.customer_details?.name ?? email;

  if (!stripe_subscription_id || !email) return;

  const existing = await PackageSubscription.findOne({ stripe_checkout_session_id: session.id });
  if (existing) return;

  // First invoice must equal the flat monthly fee.
  if (amount_mismatch(session, PLANS.clinica.monthly)) {
    return flag_amount_mismatch(session, { type: 'subscription', label: PLANS.clinica.name, expected_eur: PLANS.clinica.monthly });
  }

  const subscription = await stripe.subscriptions.retrieve(stripe_subscription_id);
  const started_at   = new Date(subscription.current_period_start * 1000);
  const next_billing = new Date(subscription.current_period_end   * 1000);

  const client = await ensure_account({ email, full_name, plan: 'clinica' });

  await Client.findByIdAndUpdate(client._id, {
    active_employees:  CLINICA_EMPLOYEES,
    setup_fee_paid:    true,
    onboarding_status: 'pending_form',
    office_status:     'requested',
    office_plan:       'full',
    status:            'active',
  });
  notify_office_requested({
    client: { _id: client._id, email, full_name },
    plan: 'full',
    employees: CLINICA_EMPLOYEES,
    source: 'clinica_checkout',
    amount: PLANS.clinica.monthly,
    currency: 'EUR',
  }).catch(() => {});

  await PackageSubscription.create({
    client_id:                  client._id,
    package_slug:               'clinica',
    stripe_subscription_id,
    stripe_customer_id,
    stripe_checkout_session_id: session.id,
    status:                     'active',
    started_at,
    next_billing_date:          next_billing,
    amount_monthly:             PLANS.clinica.monthly,
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
    description:       `${PLANS.clinica.name} — primer mes`,
    type:              'subscription',
    reference_slug:    'clinica',
    reference_label:   PLANS.clinica.name,
    receipt_url,
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

// Subscription cancelled in Stripe — also covers legacy plans still active.
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

// Renewal invoice paid — records the payment, updates next billing date,
// reactivates if suspended. Generic: also covers legacy plan subscriptions.
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
  create_clinica_checkout_session,
  create_manual_checkout_session,
  handle_stripe_event,
};
