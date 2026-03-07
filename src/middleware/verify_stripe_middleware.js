import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Validates the Stripe-Signature header and attaches the parsed event to req.stripe_event
const verify_stripe_middleware = (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    return res.status(400).json({ success: false, message: 'Missing Stripe signature' });
  }

  try {
    const event = stripe.webhooks.constructEvent(
      req.body, // raw Buffer, set by express.raw() in app.js
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    req.stripe_event = event;
    next();
  } catch (err) {
    return res.status(400).json({ success: false, message: `Webhook error: ${err.message}` });
  }
};

export default verify_stripe_middleware;
