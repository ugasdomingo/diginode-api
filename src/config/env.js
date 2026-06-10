const required_vars = [
  'PORT',
  'FRONTEND_URL',
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
  'MAKE_CONTENT_WEBHOOK_URL',
  'MAKE_RECEPCIONISTA_WEBHOOK_URL',
  'META_VERIFY_TOKEN',
];

// Secrets that must be strong (>= 32 chars) and not left as their placeholder value.
// Maps the env var to a substring that, if present, betrays an un-rotated placeholder.
const secret_vars = {
  JWT_SECRET:          'change_this',
  MAKE_WEBHOOK_SECRET: 'change_this',
  CAL_WEBHOOK_SECRET:  'change_this',
};

const validate_env = () => {
  const missing = required_vars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Guard against weak / placeholder secrets — a placeholder JWT_SECRET means
  // anyone who has read .env.example can forge admin tokens.
  const weak = [];
  for (const [key, placeholder] of Object.entries(secret_vars)) {
    const value = process.env[key] ?? '';
    if (value.length < 32 || value.includes(placeholder)) {
      weak.push(key);
    }
  }
  if (weak.length > 0) {
    throw new Error(
      `Insecure secret(s): ${weak.join(', ')}. ` +
      `Each must be a strong random value of at least 32 characters and must not contain "change_this". ` +
      `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
    );
  }
};

export default validate_env;
