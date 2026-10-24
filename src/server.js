import 'dotenv/config';
import cron from 'node-cron';
import validate_env from './config/env.js';
import connect_db from './config/db.js';
import app from './app.js';
import Lead from './models/lead_model.js';
import DemoAction from './models/demo_action_model.js';
import DemoQuota from './models/demo_quota_model.js';
import { run_followups } from './services/followup_service.js';
import { retry_lead_notifications } from './services/lead_capture_service.js';
import logger from './utils/logger.js';

validate_env();

const PORT = process.env.PORT || 3000;

const start = async () => {
  await connect_db();
  // Wait for uniqueness and TTL indexes before accepting public requests. No index is dropped.
  await Promise.all([Lead.init(), DemoAction.init(), DemoQuota.init()]);

  // Lead follow-up sequence (F3-5). Opt-in to avoid sending real emails in dev:
  // set ENABLE_FOLLOWUPS=true in production. Runs hourly.
  if (process.env.ENABLE_FOLLOWUPS === 'true') {
    cron.schedule('0 * * * *', () => {
      run_followups().catch((err) => logger.error({ err }, '[followup] run failed'));
    });
    logger.info('[followup] hourly sequence enabled');
  }

  cron.schedule('*/5 * * * *', () => {
    retry_lead_notifications().catch(() => logger.error('[leads] notification retry failed'));
  });

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
};

start();
