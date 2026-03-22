import Payment from '../models/payment_model.js';

const paypal_base = () => process.env.PAYPAL_API_URL;

// Gets a short-lived PayPal access token using client credentials
const get_access_token = async () => {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');

  const res = await fetch(`${paypal_base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('PayPal auth failed');
  return data.access_token;
};

// Returns stored payment records for a client (populated from webhook events)
const get_invoices = async (client_id) => {
  const payments = await Payment.find({ client_id }).sort({ created_at: -1 }).limit(24);

  return payments.map((p) => ({
    id: p._id,
    amount: p.amount,
    currency: p.currency,
    status: 'paid',
    created_at: p.created_at,
    description: p.description ?? 'Pago',
  }));
};

// Creates a PayPal order for a one-time payment (course purchase)
// Returns the PayPal approval URL to redirect the user to
const create_paypal_order = async ({ title, amount, currency = 'EUR', success_url, cancel_url }) => {
  const token = await get_access_token();

  const res = await fetch(`${paypal_base()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `order-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: currency, value: amount.toFixed(2) },
          description: title,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
            return_url: success_url,
            cancel_url,
          },
        },
      },
    }),
  });

  const order = await res.json();
  if (order.error) throw new Error(order.error_description ?? 'PayPal order creation failed');

  const approval = order.links?.find((l) => l.rel === 'payer-action');
  return { url: approval?.href, order_id: order.id };
};

export { get_invoices, create_paypal_order, get_access_token };
