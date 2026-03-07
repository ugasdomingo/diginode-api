import { timingSafeEqual } from 'crypto';

// Validates the X-Cal-Secret header against the env secret.
const verify_cal_middleware = (req, res, next) => {
  const provided_secret = req.headers['x-cal-secret'];

  if (!provided_secret) {
    return res.status(401).json({ success: false, message: 'Missing webhook secret' });
  }

  const expected = Buffer.from(process.env.CAL_WEBHOOK_SECRET);
  const provided = Buffer.from(provided_secret);

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }

  next();
};

export default verify_cal_middleware;
