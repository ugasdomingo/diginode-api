import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Returns the list of invoices for a client, formatted for the portal
const get_invoices = async (stripe_customer_id) => {
  const { data: invoices } = await stripe.invoices.list({
    customer: stripe_customer_id,
    limit: 24,
  });

  return invoices.map((inv) => ({
    id: inv.id,
    amount: inv.amount_paid / 100,
    currency: inv.currency.toUpperCase(),
    status: inv.status,
    created_at: new Date(inv.created * 1000).toISOString(),
    invoice_url: inv.hosted_invoice_url,
    pdf_url: inv.invoice_pdf,
  }));
};

// Creates a Stripe Checkout Session (setup fee + recurring subscription)
const create_checkout_session = async ({ email, name, plan, success_url, cancel_url }) => {
  const price_id = plan === 'spain'
    ? process.env.STRIPE_PRICE_SPAIN
    : process.env.STRIPE_PRICE_LATAM;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: price_id, quantity: 1 }],
    metadata: { client_name: name, plan },
    success_url,
    cancel_url,
  });

  return { url: session.url, session_id: session.id };
};

export { get_invoices, create_checkout_session };
