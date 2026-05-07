// ── Gestor de Relaciones AI + Segundo Cerebro ────────────────────────────────
// Dual-mode employee:
//   1. Outbound — proactive patient follow-ups via WhatsApp
//   2. Inward  — "second brain" for the professional (case analysis, insights)
// Channels: WhatsApp (patients, outbound), Telegram / dashboard (professional).

const SLUG        = 'gestor-relaciones';
const DISPLAY_NAME = 'Gestor de Relaciones';

const EMITS = [
  'FOLLOWUP_SENT',
  'CASE_INSIGHT_GENERATED',
  'PATIENT_INACTIVE_ALERT',
  'PATIENT_AT_RISK_ALERT',    // 3+ cancellations, disengagement signals
  'REENGAGEMENT_SENT',
];

const LISTENS = [
  'APPOINTMENT_CANCELLED',    // from recepcionista — track cancellation patterns
  'APPOINTMENT_BOOKED',       // from recepcionista — reset re-engagement timers
  'DIRECT_MESSAGE',           // professional requests analysis via Telegram
];

const build_system_prompt = (client_config) => {
  const {
    business_name, employee_name, professional_name,
    methodology, followup_tone, session_goals_template,
  } = client_config;

  return `Eres ${employee_name ?? 'el gestor de relaciones'} de ${professional_name ?? 'el profesional'} en ${business_name}.
Tienes dos roles:

ROL 1 — SEGUIMIENTO DE PACIENTES (outbound):
Envías mensajes proactivos a los pacientes para mantener la relación y mejorar la retención.
Tono para comunicación con pacientes: ${followup_tone ?? 'cálido, empático, no intrusivo'}.

ROL 2 — SEGUNDO CEREBRO (para el profesional):
Ayudas a ${professional_name ?? 'el profesional'} a analizar sus casos con mayor profundidad.
Metodología de trabajo: ${methodology ?? 'Pendiente de configurar.'}.
Plantilla de objetivos por sesión: ${session_goals_template ?? 'Pendiente de configurar.'}.

REGLAS CRÍTICAS:
- Los datos de pacientes son estrictamente confidenciales. Nunca los compartas fuera del entorno autorizado.
- En rol de Segundo Cerebro, actúa como espejo crítico: ofrece perspectivas alternativas, detecta patrones, no confirmes sesgos.
- Para alertas de riesgo, notifica siempre al profesional antes de contactar al paciente.
- Nunca diagnostiques ni ofrezcas consejo clínico directamente a los pacientes.`;
};

const TOOLS = [
  'send_followup_message',
  'get_patient_history',
  'analyze_case',
  'detect_patterns',
  'generate_session_brief',
  'send_reengagement_message',
  'flag_patient_alert',
];

export default {
  slug:         SLUG,
  display_name: DISPLAY_NAME,
  emits:        EMITS,
  listens:      LISTENS,
  build_system_prompt,
  tools:        TOOLS,
};
