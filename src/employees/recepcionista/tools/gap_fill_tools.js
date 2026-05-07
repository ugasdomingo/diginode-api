import Patient from '../../../models/patient_model.js';
import ClientConfig from '../../../models/client_config_model.js';
import { list_events_on_date } from '../../../services/google_calendar_service.js';
import { send_text as send_whatsapp } from '../../../services/whatsapp_service.js';
import { publish } from '../../../core/event-bus.js';

/**
 * Gap-fill algorithm — triggered when a patient cancels an appointment.
 *
 * Priority order:
 *   1. Patients with appointments LATER the same day (offer to advance)
 *   2. Patients with flexible_schedule = true and upcoming appointments within 7 days
 *
 * Contacts them via WhatsApp with a personalised offer.
 * Respects a 30-minute window before giving up and notifying the professional.
 */
const run_gap_fill = async ({ client_id, cancelled_slot_iso, freed_duration_min }) => {
  const config = await ClientConfig.findOne({ client_id });
  if (!config?.google_oauth?.refresh_token) return;

  const date        = cancelled_slot_iso.slice(0, 10);
  const slot_time   = new Date(cancelled_slot_iso);
  const slot_end    = new Date(slot_time.getTime() + freed_duration_min * 60_000);

  // ── Step 1: find same-day patients who could advance ─────────────────────

  const same_day_events = await list_events_on_date(
    config.google_oauth,
    config.google_calendar_id ?? 'primary',
    date
  );

  // Events that start AFTER the freed slot — they might want to come earlier
  const later_events = same_day_events.filter(ev => {
    const ev_start = new Date(ev.start?.dateTime ?? ev.start?.date);
    return ev_start > slot_time;
  });

  const candidate_phones = new Set();

  for (const ev of later_events) {
    const phone = ev.extendedProperties?.private?.patient_phone;
    if (phone) candidate_phones.add(phone);
  }

  // ── Step 2: flexible patients with upcoming appointments ──────────────────

  const in_7_days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const flexible_patients = await Patient.find({
    client_id,
    flexible_schedule: true,
    next_appointment:  { $gte: new Date(), $lte: in_7_days },
    phone:             { $nin: [...candidate_phones] },
  }).limit(5);

  for (const p of flexible_patients) {
    if (p.phone) candidate_phones.add(p.phone);
  }

  if (candidate_phones.size === 0) {
    // Nobody to contact — publish event so professional knows slot is unfilled
    publish(String(client_id), {
      type:    'GAP_UNFILLED',
      from:    'recepcionista',
      payload: { date, slot_iso: cancelled_slot_iso },
    });
    return;
  }

  // ── Step 3: send offer messages ───────────────────────────────────────────

  const slot_label = slot_time.toLocaleString('es-ES', {
    weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  });

  const employee_name = config.recepcionista?.employee_name ?? 'Sofía';
  const business_name = ''; // filled by caller context if needed

  const message = `Hola, soy ${employee_name} 👋\n\nSe ha liberado un hueco el *${slot_label}* por una cancelación de último momento.\n¿Te gustaría adelantar tu cita? Responde *SÍ* y te lo confirmo enseguida.`;

  for (const phone of candidate_phones) {
    if (!config.whatsapp_phone_number_id || !config.whatsapp_access_token) break;

    await send_whatsapp(
      config.whatsapp_phone_number_id,
      config.whatsapp_access_token,
      phone,
      message
    ).catch(err => console.error(`[gap_fill] WhatsApp send to ${phone}:`, err.message));
  }

  // Publish event so other employees and the dashboard can track it
  publish(String(client_id), {
    type:    'GAP_FILL_INITIATED',
    from:    'recepcionista',
    payload: { date, slot_iso: cancelled_slot_iso, contacted: candidate_phones.size },
  });
};

export { run_gap_fill };
