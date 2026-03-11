const required_vars = [
  'PORT',
  'MONGO_URI',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'MAKE_WEBHOOK_SECRET',
  'CAL_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'CAL_BOOKING_LINK',
  // MAKE_CONTENT_WEBHOOK_URL is optional — server starts without it,
  // campaigns are saved but the Make.com scenario won't be triggered
  // until the var is set in Railway.
];

const validate_env = () => {
  const missing = required_vars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

export default validate_env;
