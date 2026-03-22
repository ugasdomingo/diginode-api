import { get_access_token } from '../services/billing_service.js';

// Verifies a PayPal webhook event signature using PayPal's own verification API
const verify_paypal_middleware = async (req, res, next) => {
  try {
    const token = await get_access_token();

    const verification_res = await fetch(
      `${process.env.PAYPAL_API_URL}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo:         req.headers['paypal-auth-algo'],
          cert_url:          req.headers['paypal-cert-url'],
          transmission_id:   req.headers['paypal-transmission-id'],
          transmission_sig:  req.headers['paypal-transmission-sig'],
          transmission_time: req.headers['paypal-transmission-time'],
          webhook_id:        process.env.PAYPAL_WEBHOOK_ID,
          webhook_event:     req.body,
        }),
      }
    );

    const result = await verification_res.json();

    if (result.verification_status !== 'SUCCESS') {
      return res.status(400).json({ success: false, message: 'Invalid PayPal webhook signature' });
    }

    next();
  } catch (err) {
    return res.status(400).json({ success: false, message: `PayPal webhook error: ${err.message}` });
  }
};

export default verify_paypal_middleware;
