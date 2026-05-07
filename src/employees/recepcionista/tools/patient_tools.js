import Patient from '../../../models/patient_model.js';

// ── Tool definitions ────────────────────────────────────────────────────────

export const PATIENT_TOOL_DEFS = [
  {
    name: 'get_patient_info',
    description: 'Retrieves information about the current patient, including their appointment history and preferences.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_patient_flexible',
    description: 'Marks the patient as flexible with their schedule, meaning they can be contacted when an earlier slot opens.',
    input_schema: {
      type: 'object',
      properties: {
        flexible: { type: 'boolean', description: 'true to enable flexible scheduling, false to disable' },
      },
      required: ['flexible'],
    },
  },
  {
    name: 'escalate_to_professional',
    description: 'Escalates the conversation to the human professional when the patient has a question or need that the receptionist cannot resolve.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Brief description of why escalation is needed' },
      },
      required: ['reason'],
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────────────

export const execute_patient_tool = async (name, input, context) => {
  const { patient, client_id, send_professional_alert } = context;

  switch (name) {
    case 'get_patient_info': {
      if (!patient) return 'No hay información previa de este paciente.';

      const parts = [];
      if (patient.name)              parts.push(`Nombre: ${patient.name}`);
      if (patient.total_appointments) parts.push(`Citas totales: ${patient.total_appointments}`);
      if (patient.cancelled_count)    parts.push(`Cancelaciones: ${patient.cancelled_count}`);
      if (patient.next_appointment)   parts.push(`Próxima cita: ${new Date(patient.next_appointment).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
      if (patient.flexible_schedule)  parts.push('Prefiere cita flexible: sí');
      if (patient.notes)              parts.push(`Notas: ${patient.notes}`);

      return parts.length > 0 ? parts.join('\n') : 'Paciente nuevo, sin historial previo.';
    }

    case 'set_patient_flexible': {
      if (!patient) return 'No se pudo actualizar: paciente no encontrado.';

      await Patient.findByIdAndUpdate(patient._id, {
        flexible_schedule: input.flexible,
      });

      return input.flexible
        ? 'Perfecto, te avisaré si se libera un hueco antes de tu cita.'
        : 'Entendido, mantendremos tu cita en la fecha y hora actuales.';
    }

    case 'escalate_to_professional': {
      // Notify the professional via the event bus or direct alert
      if (typeof send_professional_alert === 'function') {
        await send_professional_alert(input.reason, patient);
      }
      return `He avisado al profesional sobre tu consulta: "${input.reason}". Te responderá en breve.`;
    }

    default:
      return `Tool desconocida: ${name}`;
  }
};
