import { timingSafeEqual } from 'crypto';

// Validates the X-Make-Secret header against the env secret.
// Uses timingSafeEqual to prevent timing attacks.
const verify_make_middleware = (req, res, next) => {
  const provided_secret = req.headers['x-make-secret'];

  if (!provided_secret) {
    return res.status(401).json({ success: false, message: 'Missing webhook secret' });
  }

  const expected = Buffer.from(process.env.MAKE_WEBHOOK_SECRET);
  const provided = Buffer.from(provided_secret);

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }

  next();
};

export default verify_make_middleware;
