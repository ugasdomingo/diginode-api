import process from 'node:process';
import { defineConfig } from 'vitest/config';

// Dummy env so modules that build SDK clients at import time (Resend, Stripe,
// OpenAI, Anthropic, Airtable) don't throw during unit tests.
export default defineConfig({
  test: {
    disableConsoleIntercept: process.env.PUBLIC_REVIEW_SERVER === 'true',
    env: {
      JWT_SECRET: 'local-tests-only-not-a-production-secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_local_tests_only',
      CAL_WEBHOOK_SECRET: 'cal_local_tests_only',
      FRONTEND_URL: 'http://localhost:4173',
      NODE_ENV: 'test',
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
