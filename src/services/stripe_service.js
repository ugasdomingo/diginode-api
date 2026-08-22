import Stripe from 'stripe';
import { randomBytes } from 'crypto';
import { PLANS, CLINICA_EMPLOYEES } from '../config/plans.js';
import { get_training } from '../config/trainings.js';
import Client from '../models/client_model.js';
import User from '../models/user_model.js';
import PackageSubscription from '../models/package_subscription_model.js';
import Payment from '../models/payment_model.js';
import TrainingEnrollment from '../models/training_enrollment_model.js';
import { send_welcome_email, send_suspension_email, send_training_welcome_email } from './email_service.js';
import { notify_office_requested, notify_ops } from './ops_notify_service.js';

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
//
// `send_welcome` lets each product deliver its own credentials email (the
// Clínica welcome and the training welcome say very different things). It is
// only called when a User is actually created, so a buyer who already has an
// account never receives a second temporary password.
// Note: `plan` only applies when the Client is created — buying a training must
// never downgrade an existing Clínica client.
const ensure_account = async ({ email, full_name, plan, send_welcome = send_welcome_email }) => {
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
    await send_welcome(email, { name: full_name, temp_password });
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

// Live training (taller) — one-off payment, limited seats. Buyers have no
// account yet: it is created on fulfillment and the credentials travel by email,
// while the success page exchanges the session id for an immediate login.
const create_training_checkout_session = async (slug) => {
  const training = get_training(slug);

  if (!training) {
    const err = new Error('Formación no encontrada');
    err.status_code = 404;
    throw err;
  }

  if (training.status !== 'open') {
    const err = new Error('Las inscripciones para esta formación están cerradas.');
    err.status_code = 409;
    throw err;
  }

  // Best-effort capacity guard: two buyers checking out simultaneously can still
  // slip through, and that is deliberate — see handle_training_checkout, which
  // honours the seat and flags it rather than keeping money for nothing.
  const seats_taken = await TrainingEnrollment.count_seats(training.slug);
  if (seats_taken >= training.capacity) {
    const err = new Error('Plazas agotadas.');
    err.status_code = 409;
    throw err;
  }

  const base = process.env.FRONTEND_URL;

  const session = await stripe.checkout.sessions.create({
    mode:                 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     training.currency.toLowerCase(),
          product_data: { name: `${training.name} — Taller online en directo` },
          unit_amount:  Math.round(training.price * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/formacion/${training.slug}/gracias?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${base}/formacion/${training.slug}`,
    locale:      'es',
    metadata:    { type: 'training', training_slug: training.slug },
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

  if (type === 'clinica')       await handle_clinica_checkout(session);
  else if (type === 'training') await handle_training_checkout(session);
  else if (type === 'manual')   await handle_manual_checkout(session);
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
    // Explicit: ensure_account only sets `plan` when it creates the Client, so a
    // buyer who first bought a training would otherwise stay on plan 'course'.
    plan:              'clinica',
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

// Live training (taller) — records the seat, creates the portal account and
// emails the credentials. Exported because the success page runs the very same
// fulfillment when it beats the webhook, so it must be safe to call twice.
//
// The TrainingEnrollment insert is the lock: its unique index on
// stripe_session_id means whichever call arrives second exits right there,
// before any account or email work happens.
const handle_training_checkout = async (session) => {
  const training_slug = session.metadata?.training_slug;
  const training      = get_training(training_slug);
  const email         = session.customer_details?.email;
  const full_name     = session.customer_details?.name ?? email;

  if (!training || !email) return null;

  const already = await TrainingEnrollment.findOne({ stripe_session_id: session.id });
  if (already) return already;

  // The amount charged must match the published price for this training.
  if (amount_mismatch(session, training.price)) {
    await flag_amount_mismatch(session, {
      type:         'course',
      label:        training.name,
      expected_eur: training.price,
    });
    return null;
  }

  // A seat sold past capacity is honoured, never refused: the money is already
  // taken. It is flagged here and ops gets a Slack ping to sort it out.
  const seats_taken = await TrainingEnrollment.count_seats(training.slug);
  const overbooked  = seats_taken >= training.capacity;

  let enrollment;
  try {
    enrollment = await TrainingEnrollment.create({
      training_slug:     training.slug,
      email,
      name:              full_name,
      stripe_session_id: session.id,
      amount:            charged_eur(session),
      currency:          (session.currency ?? 'eur').toUpperCase(),
      status:            'paid',
      overbooked,
    });
  } catch (err) {
    // Duplicate key — the webhook and the success page raced. The winner owns
    // the fulfillment; return its record so the caller can carry on.
    if (err?.code === 11000) return TrainingEnrollment.findOne({ stripe_session_id: session.id });
    throw err;
  }

  // A failed email must not abort account creation: the buyer can still get in
  // through the success page, and ops is told the credentials never went out.
  const send_welcome = async (to, payload) => {
    try {
      await send_training_welcome_email(to, { ...payload, training });
    } catch (err) {
      notify_ops(
        `:warning: *Fallo al enviar credenciales de formación* — ${to} (${training.name}). ` +
        `El alumno puede entrar por la página de gracias. Error: ${err?.message ?? 'desconocido'}`
      ).catch(() => {});
    }
  };

  const client = await ensure_account({ email, full_name, plan: 'course', send_welcome });

  if (client) {
    enrollment = await TrainingEnrollment.findByIdAndUpdate(
      enrollment._id,
      { client_id: client._id },
      { new: true }
    );
  }

  const receipt_url = await get_receipt_url(session.payment_intent);

  try {
    await Payment.create({
      client_id:                client?._id ?? undefined,
      payer_email:              email,
      payer_name:               full_name,
      stripe_session_id:        session.id,
      stripe_payment_intent_id: session.payment_intent ?? undefined,
      amount:                   charged_eur(session),
      currency:                 (session.currency ?? 'eur').toUpperCase(),
      description:              training.name,
      type:                     'course',
      reference_slug:           training.slug,
      reference_label:          training.name,
      receipt_url,
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }

  notify_ops([
    overbooked
      ? ':rotating_light: *Inscripción POR ENCIMA DEL AFORO* — revisar'
      : ':books: *Nueva inscripción a formación*',
    `*Formación:* ${training.name} (${training.slug})`,
    `*Alumno:* ${full_name} (${email})`,
    `*Plazas:* ${seats_taken + 1}/${training.capacity} · *Importe:* ${charged_eur(session)} EUR`,
  ].join('\n')).catch(() => {});

  return enrollment;
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
  create_training_checkout_session,
  create_manual_checkout_session,
  handle_training_checkout,
  handle_stripe_event,
  stripe,
};
