import User from '../models/user_model.js';
import Client from '../models/client_model.js';
import Lead from '../models/lead_model.js';
import Payment from '../models/payment_model.js';
import { send_welcome_email, send_suspension_email } from './email_service.js';

// Called when PayPal fires BILLING.SUBSCRIPTION.ACTIVATED (new recurring subscriber)
const handle_successful_payment = async (resource) => {
  const email = resource.subscriber?.email_address;
  const given = resource.subscriber?.name?.given_name ?? '';
  const surname = resource.subscriber?.name?.surname ?? '';
  const name = `${given} ${surname}`.trim() || email;
  const plan = resource.custom_id || 'latam';
  const paypal_subscription_id = resource.id;

  // Avoid duplicates if the webhook fires more than once
  const existing = await Client.findOne({ paypal_subscription_id });
  if (existing) return existing;

  const client = await Client.create({
    name,
    email,
    plan,
    paypal_subscription_id,
    setup_fee_paid: true,
    status: 'active',
  });

  // Create the portal login account for this client
  const temp_password = generate_temp_password();
  const password_hash = await User.hash_password(temp_password);

  await User.create({
    email,
    password_hash,
    role: 'client',
    client_id: client._id,
  });

  await send_welcome_email(email, { name, temp_password });

  return client;
};

// Called when PayPal fires BILLING.SUBSCRIPTION.CANCELLED
const handle_subscription_deleted = async (resource) => {
  const paypal_subscription_id = resource.id;

  const client = await Client.findOneAndUpdate(
    { paypal_subscription_id },
    { status: 'suspended' },
    { new: true }
  );

  if (client) {
    await send_suspension_email(client.email, { name: client.name });
  }
};

// Called when PayPal fires PAYMENT.SALE.COMPLETED (subscription renewal)
// Reactivates suspended clients and stores the payment record
const handle_invoice_paid = async (resource) => {
  const paypal_subscription_id = resource.billing_agreement_id;
  if (!paypal_subscription_id) return;

  const client = await Client.findOneAndUpdate(
    { paypal_subscription_id, status: 'suspended' },
    { status: 'active' },
    { new: true }
  );

  if (client) {
    await Payment.create({
      client_id: client._id,
      paypal_subscription_id,
      amount: parseFloat(resource.amount?.total ?? 0),
      currency: resource.amount?.currency ?? 'EUR',
      description: 'Renovación suscripción',
    });
  }
};

// Called when PayPal fires PAYMENT.CAPTURE.COMPLETED (one-time course payment)
const handle_capture_completed = async (resource) => {
  await Payment.create({
    paypal_order_id:   resource.supplementary_data?.related_ids?.order_id ?? resource.id,
    paypal_capture_id: resource.id,
    payer_email: resource.payer?.email_address,
    payer_name:  `${resource.payer?.name?.given_name ?? ''} ${resource.payer?.name?.surname ?? ''}`.trim(),
    amount:   parseFloat(resource.amount?.value ?? 0),
    currency: resource.amount?.currency_code ?? 'EUR',
    description: resource.purchase_units?.[0]?.description ?? 'Compra de curso',
  });
};

// Called when Cal.com fires BOOKING_CREATED
const handle_meeting_booked = async ({ booking_id, attendee_email, attendee_name }) => {
  let lead = await Lead.findOne({
    $or: [
      { contact_id: attendee_email },
      { name: { $regex: attendee_name, $options: 'i' } },
    ],
  });

  if (lead) {
    lead.status = 'meeting_booked';
    lead.cal_booking_id = booking_id;
    if (attendee_name && !lead.name) lead.name = attendee_name;
    await lead.save();
  } else {
    lead = await Lead.create({
      contact_id: attendee_email,
      platform: 'website',
      name: attendee_name,
      status: 'meeting_booked',
      cal_booking_id: booking_id,
    });
  }

  return lead;
};

// Marks a lead as won and creates the client manually (used from the admin dashboard)
const convert_lead_to_client = async (lead_id, client_data) => {
  const lead = await Lead.findByIdAndUpdate(lead_id, { status: 'won' }, { new: true });

  if (!lead) {
    const err = new Error('Lead not found');
    err.status_code = 404;
    throw err;
  }

  const client = await Client.create({
    ...client_data,
    lead_id: lead._id,
    status: 'pending',
  });

  return client;
};

const generate_temp_password = () => {
  return Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4).toUpperCase();
};

export {
  handle_successful_payment,
  handle_subscription_deleted,
  handle_invoice_paid,
  handle_capture_completed,
  handle_meeting_booked,
  convert_lead_to_client,
};
