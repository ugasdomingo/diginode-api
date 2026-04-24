import Payment from '../models/payment_model.js';
import PackageSubscription from '../models/package_subscription_model.js';

// Returns the full billing overview for a client in a single parallel DB call.
// Used by GET /api/portal/me to avoid multiple sequential requests.
const get_client_billing = async (client_id) => {
  const [payments, subscription] = await Promise.all([
    Payment.find({ client_id }).sort({ created_at: -1 }).limit(50),
    PackageSubscription.findOne({ client_id, status: { $ne: 'canceled' } }).sort({ created_at: -1 }),
  ]);

  return { payments, subscription };
};

export { get_client_billing };
