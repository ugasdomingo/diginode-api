import 'dotenv/config';
import cron from 'node-cron';
import validate_env from './config/env.js';
import connect_db from './config/db.js';
import app from './app.js';
import { run_followups } from './services/followup_service.js';

validate_env();

const PORT = process.env.PORT || 3000;

const start = async () => {
  await connect_db();

  // Lead follow-up sequence (F3-5). Opt-in to avoid sending real emails in dev:
  // set ENABLE_FOLLOWUPS=true in production. Runs hourly.
  if (process.env.ENABLE_FOLLOWUPS === 'true') {
    cron.schedule('0 * * * *', () => {
      run_followups().catch((err) => console.error('[followup] run failed:', err.message));
    });
    console.log('[followup] hourly sequence enabled');
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
};

start();
