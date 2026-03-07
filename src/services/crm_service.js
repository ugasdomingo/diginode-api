import User from '../models/user_model.js';
import Client from '../models/client_model.js';
import Lead from '../models/lead_model.js';
import { send_welcome_email, send_suspension_email } from './email_service.js';

// Called when Stripe fires checkout.session.completed or invoice.paid for a new subscription
const handle_successful_payment = async (stripe_event) => {
  const session = stripe_event.data.object;
  const { customer, subscription, customer_email, customer_details, metadata } = session;

  const email = customer_email || customer_details?.email;
  const name = customer_details?.name || metadata?.client_name || email;
  const plan = metadata?.plan || 'latam';

  // Avoid duplicates if the webhook fires more than once
  const existing_client = await Client.findOne({ stripe_customer_id: customer });
  if (existing_client) return existing_client;

  const client = await Client.create({
    name,
    email,
    plan,
    stripe_customer_id: customer,
    stripe_subscription_id: subscription,
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

// Called when Stripe fires customer.subscription.deleted
const handle_subscription_deleted = async (stripe_event) => {
  const subscription = stripe_event.data.object;

  const client = await Client.findOneAndUpdate(
    { stripe_subscription_id: subscription.id },
    { status: 'suspended' },
    { new: true }
  );

  if (client) {
    await send_suspension_email(client.email, { name: client.name });
  }
};

// Called when invoice.paid fires for an existing subscription renewal
const handle_invoice_paid = async (stripe_event) => {
  const invoice = stripe_event.data.object;

  // Reactivate if previously suspended
  await Client.findOneAndUpdate(
    { stripe_customer_id: invoice.customer, status: 'suspended' },
    { status: 'active' }
  );
};

// Called when Cal.com fires MEETING_BOOKED
const handle_meeting_booked = async ({ booking_id, attendee_email, attendee_name }) => {
  // Update the lead by matching on email or name
  const lead = await Lead.findOne({
    $or: [
      { name: { $regex: attendee_name, $options: 'i' } },
    ],
    status: { $in: ['qualified', 'in_conversation'] },
  });

  if (lead) {
    lead.status = 'meeting_booked';
    lead.cal_booking_id = booking_id;
    await lead.save();
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

// Generates a simple temporary password for the welcome email
const generate_temp_password = () => {
  return Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4).toUpperCase();
};

export {
  handle_successful_payment,
  handle_subscription_deleted,
  handle_invoice_paid,
  handle_meeting_booked,
  convert_lead_to_client,
};
