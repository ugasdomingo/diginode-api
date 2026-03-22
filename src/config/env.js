const required_vars = [
  'PORT',
  'FRONTEND_URL',
  'MONGO_URI',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_SECRET',
  'PAYPAL_API_URL',
  'PAYPAL_WEBHOOK_ID',
  'MAKE_WEBHOOK_SECRET',
  'CAL_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'CAL_BOOKING_LINK',
  'MAKE_CONTENT_WEBHOOK_URL',
];

const validate_env = () => {
  const missing = required_vars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

export default validate_env;
