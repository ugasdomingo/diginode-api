import Payment from '../models/payment_model.js';

// Returns stored payment records for a client (used by the portal)
const get_invoices = async (client_id) => {
  const payments = await Payment.find({ client_id }).sort({ created_at: -1 }).limit(24);

  return payments.map((p) => ({
    id:          p._id,
    amount:      p.amount,
    currency:    p.currency,
    status:      'paid',
    created_at:  p.created_at,
    description: p.description ?? 'Pago',
  }));
};

export { get_invoices };
