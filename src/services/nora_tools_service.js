import { send_nora_demo_email } from './email_service.js';

// Max emails Nora may send a single demo contact (1 + 1 retry if not received).
export const DEMO_EMAIL_LIMIT = 2;

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

// ── Tool definitions (Anthropic schema) ─────────────────────────────────────
export const NORA_DEMO_TOOLS = [
  {
    name: 'enviar_correo',
    description:
      'Envía un correo electrónico REAL a la dirección que indique la persona. Úsala SOLO cuando te pidan explícitamente que envíes un correo. Si no tienes su dirección, pídesela antes; no la inventes.',
    input_schema: {
      type: 'object',
      properties: {
        to_email: { type: 'string', description: 'Dirección de correo del destinatario (la que dio la persona)' },
        asunto:   { type: 'string', description: 'Asunto breve del correo' },
        cuerpo:   { type: 'string', description: 'Contenido del correo, según lo que pidió la persona' },
      },
      required: ['to_email', 'asunto', 'cuerpo'],
    },
  },
  {
    name: 'agenda_semana',
    description:
      'Devuelve tu agenda de citas de la semana (demostración) a partir de hoy. Úsala cuando te pidan ver tu agenda o las citas de la semana.',
    input_schema: { type: 'object', properties: {} },
  },
];

// ── Fake weekly agenda anchored to the real "today" ─────────────────────────
const NAMES = [
  'Laura Méndez', 'Carlos Ruiz', 'María Fernández', 'Javier Soto', 'Ana Torres',
  'Diego Romero', 'Lucía Navarro', 'Pablo Gil', 'Marta Vidal', 'Sergio Castro',
  'Elena Ramos', 'Andrés Molina', 'Patricia León', 'Hugo Ortega', 'Nuria Pascual',
];
const REASONS = [
  'Primera consulta', 'Sesión de seguimiento', 'Valoración inicial',
  'Revisión', 'Consulta rápida', 'Sesión de control', 'Cita de seguimiento',
];
const TIMES = ['09:00', '10:00', '11:30', '12:30', '16:00', '17:00', '18:00'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const pick = (arr, i) => arr[i % arr.length];

// Returns up to 5 upcoming weekdays starting today, each with 3-4 appointments.
export const build_week_agenda = (now = new Date()) => {
  const days = [];
  const cursor = new Date(now);
  let seed = now.getDate();

  while (days.length < 5) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const count = 3 + (seed % 2); // 3 or 4
      const appointments = [];
      for (let i = 0; i < count; i++) {
        appointments.push({
          hora:    pick(TIMES, seed + i),
          cliente: pick(NAMES, seed + i * 3),
          motivo:  pick(REASONS, seed + i * 2),
        });
      }
      days.push({
        dia:   pick(DAY_NAMES, dow),
        fecha: cursor.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
        citas: appointments,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    seed++;
  }
  return days;
};

// ── Tool executor factory ───────────────────────────────────────────────────
// Closes over the lead so enviar_correo can enforce the per-contact cap and
// persist the captured email. Returns async (name, input) => result.
export const make_nora_tool_executor = (lead) => async (name, input) => {
  if (name === 'agenda_semana') {
    return { agenda: build_week_agenda() };
  }

  if (name === 'enviar_correo') {
    const to = String(input?.to_email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(to)) {
      return { error: 'La dirección de correo no parece válida. Pídele que la confirme.' };
    }
    if ((lead.demo_emails_sent ?? 0) >= DEMO_EMAIL_LIMIT) {
      return { error: 'Ya alcanzaste el máximo de correos de la demo para este contacto.' };
    }

    try {
      await send_nora_demo_email(to, {
        subject: input.asunto,
        body:    input.cuerpo,
        name:    lead.name,
      });
    } catch {
      return { error: 'No se pudo enviar el correo en este momento.' };
    }

    // Capture the email as a lead and advance the funnel.
    lead.email = to;
    lead.demo_emails_sent = (lead.demo_emails_sent ?? 0) + 1;
    lead.source = 'demo_whatsapp';
    if (lead.funnel_stage === 'demo_started') lead.funnel_stage = 'identified';
    await lead.save();

    return { success: true, enviado_a: to, intentos_restantes: DEMO_EMAIL_LIMIT - lead.demo_emails_sent };
  }

  return { error: `Herramienta desconocida: ${name}` };
};
