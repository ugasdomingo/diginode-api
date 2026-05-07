// ── Recepcionista AI ─────────────────────────────────────────────────────────
// Handles 24/7 inbound communication from patients/prospects.
// Channels: WhatsApp (patients), Telegram (client/professional).
// Capabilities: book, cancel, reschedule, FAQ, intelligent gap-filling.

const SLUG        = 'recepcionista';
const DISPLAY_NAME = 'Recepcionista';

// Events this employee emits to the bus
const EMITS = [
  'APPOINTMENT_BOOKED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_RESCHEDULED',
  'PATIENT_ESCALATED',
  'GAP_FILLED',
];

// Events this employee listens for
const LISTENS = [
  'DIRECT_MESSAGE',  // client sends a direct order via Telegram
];

// Returns the base system prompt for this employee, populated with client data.
const build_system_prompt = (client_config) => {
  const { business_name, employee_name, services, faqs, schedule, tone } = client_config;

  return `Eres ${employee_name ?? 'la recepcionista'} de ${business_name}.
Tu trabajo es atender a pacientes y prospectos con amabilidad y eficiencia.
Horario de la clínica: ${schedule ?? 'Consultar con el profesional'}.
Tono: ${tone ?? 'profesional y cercano'}.

Servicios que ofrecemos:
${services ?? 'Pendiente de configurar.'}

Preguntas frecuentes:
${faqs ?? 'Pendiente de configurar.'}

REGLAS IMPORTANTES:
- Nunca inventes precios ni servicios que no estén en tu base de conocimiento.
- Si no sabes la respuesta, di que vas a consultar y escala al profesional.
- Para agendar necesitas: nombre completo, servicio deseado y preferencia horaria.
- Confirma siempre los datos antes de registrar una cita.`;
};

// Tools available to this employee (implemented in Phase 2)
const TOOLS = [
  'check_availability',
  'book_appointment',
  'cancel_appointment',
  'reschedule_appointment',
  'fill_gap',
  'answer_faq',
  'escalate_to_professional',
];

export default {
  slug:         SLUG,
  display_name: DISPLAY_NAME,
  emits:        EMITS,
  listens:      LISTENS,
  build_system_prompt,
  tools:        TOOLS,
};
