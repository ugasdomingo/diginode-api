// ── Single source of truth for live trainings (talleres) ────────────────────
// Both the API (checkout + fulfillment + portal detail) and the client (via
// GET /api/trainings/:slug) read from here. NEVER hardcode a price, a date or
// a requirement anywhere else.
//
// A training is a one-off paid event: single payment, limited seats, and a
// welcome email that doubles as the access credentials for the client portal
// (buyers have no prior account — it is created when the payment confirms).

export const TRAININGS = {
  'ia-para-terapeutas': {
    slug:     'ia-para-terapeutas',
    name:     'IA para Terapeutas',
    tagline:  'Libera tu tiempo. Transforma tu consulta.',
    audience: 'Para terapeutas saturados o en crecimiento',

    // ── Commercial ──────────────────────────────────────────────────────────
    price:    100,
    currency: 'EUR',
    // Tools the attendee contracts with their own account. Shown on the landing
    // so nobody is surprised on the day of the workshop.
    tools_cost_note: 'Durante el taller usaremos herramientas de IA que contratas con tu propia cuenta (unos 25€). Te explico cómo hacerlo el mismo día.',

    // ── Logistics ───────────────────────────────────────────────────────────
    format:   'online',
    platform: 'Google Meet',
    date:     '2026-10-03',   // sábado 3 de octubre de 2026
    time:     '09:30',
    // 09:30–16:00 en sala son 6h30; descontando la hora de comer y los 30 min de
    // cortesía por los que llegan tarde, el taller efectivo son 5 horas.
    duration: '5 h — hasta las 16:00, con pausa para comer',
    timezone: 'Europe/Madrid',
    // Solo visible para compradores (private_training), nunca en la landing.
    meet_url: 'https://meet.google.com/vfu-uxxk-qzk',

    // ── Capacity ────────────────────────────────────────────────────────────
    capacity: 10,
    // Pon 'closed' para cerrar las ventas a mano sin tocar el aforo.
    status:   'open',

    // ── Contenido comercial ─────────────────────────────────────────────────
    benefits: [
      {
        title: 'Recupera tu vida personal y salud',
        text:  'Eliminamos las tareas repetitivas y administrativas que te roban las tardes.',
      },
      {
        title: 'Lánzate o vive al 100% de tu negocio',
        text:  'Automatizamos tu marketing y tu gestión para que la consulta no dependa de tu tiempo libre.',
      },
      {
        title: 'Crea y gestiona tu sistema con «Empleados IA»',
        text:  'No necesitas criterio profesional para todo: aprendes a delegar lo que no requiere tu juicio clínico.',
      },
    ],

    includes: [
      'Sesión en directo con grupo reducido (máximo 10 personas)',
      'Trabajo práctico sobre casos reales de tu propia consulta',
      'Plantillas y prompts listos para usar desde el día siguiente',
      'Espacio de preguntas y respuestas sin límite de tiempo',
      'Acceso al panel de cliente con los detalles y materiales del taller',
    ],

    // Borrador genérico — edítalo cuando tengas el detalle definitivo.
    requirements: [
      'Ordenador (portátil o de sobremesa) con cámara y micrófono: el taller es práctico y se trabaja en directo',
      'Conexión a internet estable',
      'Navegador actualizado (Chrome o Edge)',
      'Cuenta de Google para entrar a Google Meet',
      'Unos 25€ para las herramientas de IA que usaremos, que contratas con tu propia cuenta (te explico cómo el mismo día)',
      'No necesitas conocimientos técnicos previos',
      'Recomendado: trae ejemplos reales de tu consulta (mensajes típicos de pacientes, cómo gestionas tu agenda) para trabajar sobre tus propios casos',
    ],

    faq: [
      {
        q: '¿Necesito saber de tecnología?',
        a: 'No. El taller está pensado para terapeutas, no para técnicos. Vamos paso a paso y nadie se queda atrás.',
      },
      {
        q: '¿Se graba la sesión?',
        a: 'Es una sesión en directo y en grupo reducido para que puedas preguntar sobre tu caso concreto. Prioriza reservar el día completo.',
      },
      {
        q: '¿Qué pasa si no puedo asistir?',
        a: 'Escríbeme y buscamos una solución: puedo pasarte a la siguiente convocatoria.',
      },
      {
        q: '¿Los 100€ incluyen las herramientas de IA?',
        a: 'No. El taller son 100€. Las herramientas que usaremos las contratas tú con tu propia cuenta (unos 25€) y te explico cómo el mismo día.',
      },
    ],
  },
};

// Convenience accessor — returns null instead of undefined for unknown slugs.
export const get_training = (slug) => TRAININGS[slug] ?? null;

// Public-facing view. `meet_url` is intentionally omitted: it is only served to
// authenticated buyers through the portal (see private_training).
export const public_training = (t, { seats_taken = 0 } = {}) => {
  const seats_left = Math.max(t.capacity - seats_taken, 0);
  return {
    slug:            t.slug,
    name:            t.name,
    tagline:         t.tagline,
    audience:        t.audience,
    price:           t.price,
    currency:        t.currency,
    tools_cost_note: t.tools_cost_note,
    format:          t.format,
    platform:        t.platform,
    date:            t.date,
    time:            t.time,
    duration:        t.duration,
    timezone:        t.timezone,
    capacity:        t.capacity,
    seats_taken,
    seats_left,
    // The landing disables the CTA on either condition.
    sold_out:        seats_left <= 0,
    status:          t.status,
    benefits:        t.benefits,
    includes:        t.includes,
    requirements:    t.requirements,
    faq:             t.faq,
  };
};

// Buyer-facing view served through the portal — same as public plus the join link.
export const private_training = (t) => ({
  slug:         t.slug,
  name:         t.name,
  format:       t.format,
  platform:     t.platform,
  date:         t.date,
  time:         t.time,
  duration:     t.duration,
  timezone:     t.timezone,
  meet_url:     t.meet_url,
  includes:     t.includes,
  requirements: t.requirements,
});
