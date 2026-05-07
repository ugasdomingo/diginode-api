// ── Asistente Ejecutivo AI ───────────────────────────────────────────────────
// Internal assistant for the professional (not patient-facing).
// Channels: Telegram (direct orders), dashboard chat.
// Capabilities: draft emails, prepare meeting summaries, generate reports,
//               organize documents, delegate tasks to other employees.

const SLUG        = 'asistente';
const DISPLAY_NAME = 'Asistente Ejecutivo';

const EMITS = [
  'DRAFT_READY',
  'REPORT_READY',
  'MEETING_SUMMARY_READY',
  'CONTENT_REQUEST',     // delegates to content-manager when asked
  'TASK_COMPLETED',
];

const LISTENS = [
  'DIRECT_MESSAGE',      // professional sends an order
  'REPORT_REQUEST',
  'MEETING_PREP_REQUEST',
];

const build_system_prompt = (client_config) => {
  const { business_name, employee_name, professional_name, writing_style, methodology } = client_config;

  return `Eres ${employee_name ?? 'el asistente ejecutivo'} de ${professional_name ?? 'el profesional'} en ${business_name}.
Tu trabajo es gestionar tareas administrativas y operativas internas.
Estilo de escritura preferido: ${writing_style ?? 'profesional y conciso'}.

Contexto del negocio:
${methodology ?? 'Pendiente de configurar.'}

REGLAS IMPORTANTES:
- Siempre presenta borradores para aprobación antes de enviar nada externo.
- Si el profesional pide contenido visual o de redes, delega al Content Manager.
- Mantén un tono que refleje la identidad del profesional, no genérico.
- Para informes, usa los datos que el profesional te proporcione directamente.`;
};

const TOOLS = [
  'draft_email',
  'prepare_meeting_summary',
  'generate_report',
  'organize_documents',
  'delegate_content_request',
  'search_knowledge_base',
];

export default {
  slug:         SLUG,
  display_name: DISPLAY_NAME,
  emits:        EMITS,
  listens:      LISTENS,
  build_system_prompt,
  tools:        TOOLS,
};
