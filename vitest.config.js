import { defineConfig } from 'vitest/config';

// Dummy env so modules that build SDK clients at import time (Resend, Stripe,
// OpenAI, Anthropic, Airtable) don't throw during unit tests.
export default defineConfig({
  test: {
    env: {
      RESEND_API_KEY:   're_test',
      STRIPE_SECRET_KEY: 'sk_test',
      GEMINI_API_KEY:    'test',
      ANTHROPIC_API_KEY: 'test',
      OPENAI_API_KEY:    'sk-test',
      AIRTABLE_API_KEY:  'test',
      AIRTABLE_BASE_ID:  'test',
    },
  },
});
