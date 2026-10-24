import { createHash } from 'node:crypto';
import Lead from '../models/lead_model.js';
import { PRIVACY_VERSION, booking_link } from '../config/services.js';
import { notify_ops } from './ops_notify_service.js';

const conflict = () =>
  Object.assign(
    new Error('Esta solicitud ya se utilizó con otro contenido. Inicia un envío nuevo.'),
    { status_code: 409 }
  );
const receipt = (lead) => ({
  success: true,
  request_id: lead.request_id,
  message: 'Solicitud recibida. Revisaremos tu caso para acordar una conversación.',
  booking_url: booking_link(),
});

export async function notify_lead(lead) {
  // Lease in Mongo avoids simultaneous cron/retry notifications. No contact data in general logs or Slack.
  const claimed = await Lead.findOneAndUpdate(
    {
      _id: lead._id,
      notification_status: { $ne: 'sent' },
      $or: [{ notification_lock_until: null }, { notification_lock_until: { $lte: new Date() } }],
    },
    { $set: { notification_lock_until: new Date(Date.now() + 30000) } },
    { new: true }
  );
  if (!claimed) return;
  let ok = false;
  try {
    ok =
      (
        await notify_ops(
          `Nueva solicitud de ${claimed.service_interest}. Revisar en administración: ${claimed._id}`
        )
      ).ok === true;
  } catch {
    /* saved lead remains pending */
  }
  await Lead.updateOne(
    { _id: lead._id },
    {
      $set: { notification_status: ok ? 'sent' : 'pending', notification_lock_until: null },
      $inc: { notification_attempts: 1 },
    }
  );
}

export async function capture_lead(input) {
  if (input.honeypot)
    throw Object.assign(new Error('No se pudo aceptar la solicitud.'), { status_code: 400 });
  if (input.privacy_version !== PRIVACY_VERSION)
    throw Object.assign(new Error('Actualiza la página para consultar el aviso vigente.'), {
      status_code: 409,
    });
  const { honeypot: _honeypot, ...content } = input;
  const request_hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  let lead = await Lead.findOne({ request_id: input.request_id });
  if (!lead) {
    try {
      lead = await Lead.create({
        ...content,
        request_hash,
        contact_id: `request-${input.request_id}`,
        platform: 'website',
        source: 'web_form',
        status: 'new',
        funnel_stage: 'request_received',
        request_received_at: new Date(),
        privacy_version: PRIVACY_VERSION,
        privacy_shown_at: new Date(),
        notification_status: 'pending',
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      lead = await Lead.findOne({ request_id: input.request_id });
      if (!lead) throw err;
    }
  }
  if (lead.request_hash !== request_hash) throw conflict();
  try {
    await notify_lead(lead);
  } catch {
    /* capture succeeds even if notification storage/provider fails */
  }
  return receipt(lead);
}

export async function retry_lead_notifications() {
  const pending = await Lead.find({
    source: 'web_form',
    notification_status: 'pending',
    notification_attempts: { $lt: 20 },
  }).limit(25);
  for (const lead of pending) await notify_lead(lead);
}
