import {
  list_free_slots,
  create_event,
  cancel_event,
  reschedule_event,
} from '../../../services/google_calendar_service.js';
import ClientConfig from '../../../models/client_config_model.js';
import Patient from '../../../models/patient_model.js';

// ── Tool definitions (Anthropic schema) ────────────────────────────────────

export const CALENDAR_TOOL_DEFS = [
  {
    name: 'check_availability',
    description: 'Checks available appointment slots for a specific date. Use this when the patient asks about available times.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date to check in YYYY-MM-DD format. If the patient says "tomorrow", resolve to the actual date.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Books an appointment for the patient. Only call after confirming the patient\'s name, the desired slot and the service.',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string', description: 'Full name of the patient' },
        start_iso:    { type: 'string', description: 'Start datetime in ISO 8601 format' },
        end_iso:      { type: 'string', description: 'End datetime in ISO 8601 format' },
        service:      { type: 'string', description: 'Name of the service or treatment' },
        notes:        { type: 'string', description: 'Any additional notes for the appointment' },
      },
      required: ['patient_name', 'start_iso', 'end_iso'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancels an existing appointment. Use the event_id from the patient\'s record.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Google Calendar event ID to cancel' },
        reason:   { type: 'string', description: 'Cancellation reason (optional, for notes)' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Moves an existing appointment to a new time slot.',
    input_schema: {
      type: 'object',
      properties: {
        event_id:  { type: 'string', description: 'Google Calendar event ID to reschedule' },
        start_iso: { type: 'string', description: 'New start datetime in ISO 8601 format' },
        end_iso:   { type: 'string', description: 'New end datetime in ISO 8601 format' },
      },
      required: ['event_id', 'start_iso', 'end_iso'],
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────────────

export const execute_calendar_tool = async (name, input, context) => {
  const { client_id, patient } = context;

  const config = await ClientConfig.findOne({ client_id });
  if (!config?.google_oauth?.refresh_token) {
    return 'Error: el calendario no está configurado para este cliente.';
  }

  const oauth   = config.google_oauth;
  const cal_id  = config.google_calendar_id ?? 'primary';
  const dur_min = config.appointment_duration_min ?? 60;

  switch (name) {
    case 'check_availability': {
      const slots = await list_free_slots(
        oauth, cal_id, input.date, dur_min,
        config.working_hours_start, config.working_hours_end
      );
      if (slots.length === 0) return `No hay disponibilidad el ${input.date}.`;

      const formatted = slots.map(s => {
        const start = new Date(s.start);
        return start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
      });
      return `Horarios disponibles el ${input.date}:\n${formatted.join(', ')}`;
    }

    case 'book_appointment': {
      const { event_id, html_link } = await create_event(oauth, cal_id, {
        summary:       `${input.service ?? 'Consulta'} — ${input.patient_name}`,
        description:   input.notes ?? '',
        start_iso:     input.start_iso,
        end_iso:       input.end_iso,
        patient_phone: patient?.phone ?? '',
      });

      // Track the event on the patient record
      if (patient) {
        await Patient.findByIdAndUpdate(patient._id, {
          $push:  { upcoming_event_ids: event_id },
          $set:   { next_appointment: new Date(input.start_iso) },
          $inc:   { total_appointments: 1 },
        });
      }

      const time = new Date(input.start_iso).toLocaleString('es-ES', {
        weekday: 'long', day: '2-digit', month: 'long',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
      });
      return `Cita confirmada para el ${time}. ID: ${event_id}`;
    }

    case 'cancel_appointment': {
      await cancel_event(oauth, cal_id, input.event_id);

      if (patient) {
        await Patient.findByIdAndUpdate(patient._id, {
          $pull: { upcoming_event_ids: input.event_id },
          $inc:  { cancelled_count: 1 },
          $set:  { next_appointment: null },
        });
      }

      return `Cita cancelada correctamente. ID: ${input.event_id}`;
    }

    case 'reschedule_appointment': {
      const { event_id } = await reschedule_event(oauth, cal_id, input.event_id, {
        start_iso: input.start_iso,
        end_iso:   input.end_iso,
      });

      if (patient) {
        await Patient.findByIdAndUpdate(patient._id, {
          $set: { next_appointment: new Date(input.start_iso) },
        });
      }

      const time = new Date(input.start_iso).toLocaleString('es-ES', {
        weekday: 'long', day: '2-digit', month: 'long',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
      });
      return `Cita reprogramada para el ${time}.`;
    }

    default:
      return `Tool desconocida: ${name}`;
  }
};
