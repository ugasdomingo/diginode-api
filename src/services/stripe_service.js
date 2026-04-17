import Stripe from 'stripe';
import Client from '../models/client_model.js';
import User from '../models/user_model.js';
import Package from '../models/package_model.js';
import PackageSubscription from '../models/package_subscription_model.js';
import Payment from '../models/payment_model.js';
import { send_welcome_email, send_suspension_email } from './email_service.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Checkout session creators ───────────────────────────────────────────────

// Creates a Stripe Checkout Session for a one-time course purchase.
// Returns { url, session_id } — frontend redirects user to `url`.
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
          unit_amount:  Math.round(amount * 100), // Stripe uses cents
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/cursos/${course_slug}?pago=ok`,
    cancel_url:  `${base}/cursos/${course_slug}`,
    locale:      'es',
    metadata:    { type: 'course', course_slug },
  });

  return { url: session.url, session_id: session.id };
};

// Creates a Stripe Checkout Session for a recurring package subscription.
// Returns { url, session_id } — frontend redirects user to `url`.
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
    success_url:          `${base}/despacho-digital?success=true`,
    cancel_url:           `${base}/despacho-digital`,
    locale:               'es',
    metadata:             { type: 'package', package_slug: pkg.slug },
  });

  return { url: session.url, session_id: session.id };
};

// ── Webhook event router ────────────────────────────────────────────────────

// Routes incoming Stripe webhook events to the correct handler.
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

    // All other events: acknowledge without action
    default:
      break;
  }
};

// ── Private event handlers ──────────────────────────────────────────────────

// Dispatches checkout.session.completed based on the session type in metadata.
const handle_checkout_completed = async (session) => {
  const { type } = session.metadata ?? {};

  if (type === 'course') {
    await handle_course_checkout(session);
  } else if (type === 'package') {
    await handle_package_checkout(session);
  }
};

// One-time course payment — stores a payment record.
const handle_course_checkout = async (session) => {
  // Idempotency guard
  const existing = await Payment.findOne({ stripe_session_id: session.id });
  if (existing) return;

  const email     = session.customer_details?.email;
  const full_name = session.customer_details?.name ?? email;
  const amount    = (session.amount_total ?? 0) / 100;
  const slug      = session.metadata?.course_slug ?? '';

  await Payment.create({
    payer_email:           email,
    payer_name:            full_name,
    stripe_session_id:     session.id,
    stripe_payment_intent_id: session.payment_intent ?? undefined,
    amount,
    currency:    (session.currency ?? 'eur').toUpperCase(),
    description: `Curso: ${slug}`,
  });
};

// Package subscription — creates client account, user login, and subscription record.
const handle_package_checkout = async (session) => {
  const stripe_subscription_id = session.subscription;
  const stripe_customer_id     = session.customer;
  const email                  = session.customer_details?.email;
  const full_name              = session.customer_details?.name ?? email;
  const package_slug           = session.metadata?.package_slug;

  if (!stripe_subscription_id || !email || !package_slug) return;

  // Idempotency guard
  const existing = await PackageSubscription.findOne({ stripe_checkout_session_id: session.id });
  if (existing) return;

  // Retrieve subscription to get exact billing dates
  const subscription = await stripe.subscriptions.retrieve(stripe_subscription_id);
  const started_at   = new Date(subscription.current_period_start * 1000);

  const pkg = await Package.findOne({ slug: package_slug });
  const minimum_end_date = new Date(started_at);
  minimum_end_date.setMonth(minimum_end_date.getMonth() + (pkg?.minimum_months ?? 6));

  // Create or update the client record
  let client = await Client.findOne({ email });

  if (!client) {
    client = await Client.create({
      name:           full_name,
      email,
      plan:           'despacho-digital',
      status:         'active',
      setup_fee_paid: true,
    });

    const temp_password = generate_temp_password();
    const password_hash = await User.hash_password(temp_password);

    await User.create({
      email,
      password_hash,
      role:      'client',
      client_id: client._id,
    });

    await send_welcome_email(email, { name: full_name, temp_password });
  } else {
    await Client.findByIdAndUpdate(client._id, {
      plan:   'despacho-digital',
      status: 'active',
    });
  }

  // Store subscription record
  await PackageSubscription.create({
    client_id:                  client._id,
    package_slug,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_checkout_session_id: session.id,
    status:                     'active',
    started_at,
    minimum_end_date,
  });

  // Record first month's payment
  await Payment.create({
    client_id:         client._id,
    payer_email:       email,
    payer_name:        full_name,
    stripe_session_id: session.id,
    amount:            (session.amount_total ?? 0) / 100,
    currency:          (session.currency ?? 'eur').toUpperCase(),
    description:       `Suscripción ${pkg?.name ?? package_slug} — primer mes`,
  });
};

// Subscription cancelled in Stripe — suspends the client.
const handle_subscription_deleted = async (subscription) => {
  const sub = await PackageSubscription.findOneAndUpdate(
    { stripe_subscription_id: subscription.id },
    { status: 'canceled' },
    { new: true }
  );
  if (!sub) return;

  const client = await Client.findByIdAndUpdate(
    sub.client_id,
    { status: 'suspended' },
    { new: true }
  );

  if (client) {
    await send_suspension_email(client.email, { name: client.name });
  }
};

// Renewal invoice paid — records the payment, reactivates suspended clients.
const handle_invoice_succeeded = async (invoice) => {
  // Skip the creation invoice (already handled by checkout.session.completed)
  if (!invoice.subscription || invoice.billing_reason === 'subscription_create') return;

  const sub = await PackageSubscription.findOne({
    stripe_subscription_id: invoice.subscription,
  });
  if (!sub) return;

  await Client.findOneAndUpdate(
    { _id: sub.client_id, status: 'suspended' },
    { status: 'active' }
  );

  await Payment.create({
    client_id:   sub.client_id,
    amount:      (invoice.amount_paid ?? 0) / 100,
    currency:    (invoice.currency ?? 'eur').toUpperCase(),
    description: `Renovación ${sub.package_slug}`,
  });
};

const generate_temp_password = () => {
  return Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4).toUpperCase();
};

export { create_course_checkout_session, create_package_checkout_session, handle_stripe_event };
