import Lead from '../models/lead_model.js';
import { send_followup_email } from './email_service.js';

// Days after the lead was created at which each follow-up step fires.
const STEP_DAYS = [1, 3, 7, 14]; // index = current followup_step (0..3)

const DAY_MS = 24 * 60 * 60 * 1000;

// Sends the next due follow-up email to identified demo leads who have an email
// and haven't converted. Idempotent per step. Called on a schedule (F3-5).
export const run_followups = async () => {
  const now = Date.now();

  const candidates = await Lead.find({
    funnel_stage: { $in: ['identified', 'followup'] },
    email:        { $exists: true, $ne: null },
    followup_step: { $lt: STEP_DAYS.length },
  });

  let sent = 0;
  for (const lead of candidates) {
    const step_index = lead.followup_step;          // 0..3
    const due_days   = STEP_DAYS[step_index];
    const age_days   = (now - new Date(lead.created_at).getTime()) / DAY_MS;
    if (age_days < due_days) continue;

    try {
      await send_followup_email(lead.email, { name: lead.name, step: step_index + 1 });
      lead.followup_step    = step_index + 1;
      lead.last_followup_at = new Date();
      if (lead.funnel_stage === 'identified') lead.funnel_stage = 'followup';
      await lead.save();
      sent++;
    } catch (err) {
      console.error(`[followup] lead ${lead._id} step ${step_index + 1}: ${err.message}`);
    }
  }

  if (sent > 0) console.log(`[followup] sent ${sent} follow-up email(s)`);
  return sent;
};
