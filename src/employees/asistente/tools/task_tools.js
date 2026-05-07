import Knowledge from '../../../models/knowledge_model.js';
import { list_events_on_date, list_free_slots, create_event } from '../../../services/google_calendar_service.js';
import ClientConfig from '../../../models/client_config_model.js';
import { publish } from '../../../core/event-bus.js';

// ── Tool definitions ────────────────────────────────────────────────────────

export const TASK_TOOL_DEFS = [
  {
    name: 'draft_email',
    description: 'Drafts a professional email on behalf of the professional. Returns the full draft for review — nothing is sent automatically.',
    input_schema: {
      type: 'object',
      properties: {
        to:      { type: 'string', description: 'Recipient name or email address' },
        subject: { type: 'string', description: 'Email subject line' },
        context: { type: 'string', description: 'What the email should say, key points to cover, tone, or purpose' },
      },
      required: ['to', 'subject', 'context'],
    },
  },
  {
    name: 'get_agenda_summary',
    description: 'Fetches the professional\'s Google Calendar appointments for a given date and returns a structured summary.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format. If omitted, uses today.' },
      },
      required: [],
    },
  },
  {
    name: 'create_reminder',
    description: 'Creates a reminder or task event in the professional\'s Google Calendar.',
    input_schema: {
      type: 'object',
      properties: {
        title:        { type: 'string', description: 'Title of the reminder or task' },
        datetime_iso: { type: 'string', description: 'ISO 8601 datetime string for when to set the reminder' },
        notes:        { type: 'string', description: 'Optional additional notes for the event' },
        duration_min: { type: 'number', description: 'Duration in minutes (default: 30)' },
      },
      required: ['title', 'datetime_iso'],
    },
  },
  {
    name: 'search_knowledge_base',
    description: 'Searches the knowledge base for information about the business, methodology, FAQs, or protocols.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
        key:   { type: 'string', description: 'Specific document key to retrieve (optional). Omit to search all documents.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'delegate_to_content_manager',
    description: 'Delegates a content creation task to the Content Manager employee. Use when the professional asks for posts, scripts, videos, or social media content.',
    input_schema: {
      type: 'object',
      properties: {
        task_description: { type: 'string', description: 'Detailed description of what content needs to be created' },
        priority:         { type: 'string', enum: ['normal', 'urgent'], description: 'Task priority (default: normal)' },
      },
      required: ['task_description'],
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────────────

export const execute_task_tool = async (name, input, context) => {
  const { client_id } = context;

  switch (name) {

    case 'draft_email': {
      // The Asistente generates the draft inline — no external API needed.
      // Claude itself will produce the email text as part of the tool result.
      return `BORRADOR DE CORREO
───────────────────────────────
Para: ${input.to}
Asunto: ${input.subject}
───────────────────────────────
[El asistente redactará el contenido del correo en su respuesta basándose en: ${input.context}]
───────────────────────────────
⚠️ Este borrador es solo para revisión. Nada ha sido enviado.`;
    }

    case 'get_agenda_summary': {
      const config = await ClientConfig.findOne({ client_id });
      if (!config?.google_oauth?.refresh_token) {
        return 'Google Calendar no está conectado. Ve a Configuración → Conectar Google Calendar.';
      }

      const date = input.date ?? new Date().toISOString().slice(0, 10);
      const events = await list_events_on_date(
        config.google_oauth,
        config.google_calendar_id ?? 'primary',
        date
      );

      if (events.length === 0) {
        return `Sin citas el ${date}.`;
      }

      const tz = 'Europe/Madrid';
      const lines = events.map(ev => {
        const start = ev.start?.dateTime
          ? new Date(ev.start.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz })
          : 'Todo el día';
        const end = ev.end?.dateTime
          ? new Date(ev.end.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz })
          : '';
        return `• ${start}${end ? `–${end}` : ''} — ${ev.summary ?? 'Sin título'}`;
      });

      return `Agenda del ${date}:\n${lines.join('\n')}`;
    }

    case 'create_reminder': {
      const config = await ClientConfig.findOne({ client_id });
      if (!config?.google_oauth?.refresh_token) {
        return 'Google Calendar no está conectado. El recordatorio no pudo crearse.';
      }

      const duration_min = input.duration_min ?? 30;
      const start = new Date(input.datetime_iso);
      const end   = new Date(start.getTime() + duration_min * 60_000);

      const result = await create_event(
        config.google_oauth,
        config.google_calendar_id ?? 'primary',
        {
          summary:     input.title,
          description: input.notes ?? '',
          start_iso:   start.toISOString(),
          end_iso:     end.toISOString(),
        }
      );

      return `Recordatorio creado: "${input.title}" el ${start.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}. ${result.html_link ? `Ver: ${result.html_link}` : ''}`;
    }

    case 'search_knowledge_base': {
      if (input.key) {
        const doc = await Knowledge.findOne({ key: input.key });
        if (!doc) return `No se encontró ningún documento con la clave "${input.key}".`;
        return `[${input.key}]\n${doc.content}`;
      }

      // Search all knowledge documents for the query (simple text match)
      const docs = await Knowledge.find({
        content: { $regex: input.query, $options: 'i' },
      }).limit(3);

      if (docs.length === 0) {
        return `No se encontró información sobre "${input.query}" en la base de conocimiento.`;
      }

      return docs.map(d => `[${d.key}]\n${d.content.slice(0, 500)}${d.content.length > 500 ? '…' : ''}`).join('\n\n');
    }

    case 'delegate_to_content_manager': {
      publish(String(client_id), {
        type:    'CONTENT_REQUEST',
        from:    'asistente',
        payload: {
          task_description: input.task_description,
          priority:         input.priority ?? 'normal',
          requested_at:     new Date().toISOString(),
        },
      });

      return `Tarea delegada al Content Manager: "${input.task_description}". Recibirás una notificación cuando esté lista.`;
    }

    default:
      return `Tool desconocida: ${name}`;
  }
};
