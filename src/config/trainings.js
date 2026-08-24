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
    audience: 'Para vivir de tu terapia sin saturarte',

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

    // ── Para que Nora sepa vender esto, no solo recitar la fecha ────────────
    // Se inyecta en su prompt y en su base de conocimiento. Escrito en el
    // lenguaje del terapeuta, no en el de la tecnología.
    for_who:
      'Psicólogos, coaches y terapeutas que ejercen por su cuenta. Sobre todo dos perfiles: ' +
      'quien está saturado de tareas administrativas y ha dejado de tener vida fuera de la consulta, ' +
      'y quien duda de si podrá vivir de su terapia porque no le llegan pacientes suficientes. ' +
      'No hace falta ningún conocimiento técnico previo.',

    not_for:
      'No es para quien quiere que se lo monten todo hecho sin tocar nada: eso es la Clínica Digital. ' +
      'Y no es para quien busque una IA que haga terapia: el criterio clínico y el vínculo con el ' +
      'paciente no se delegan nunca, y en el taller se enseña justamente dónde está esa línea.',

    // Dolores concretos que Nora puede nombrar en una conversación.
    solves: [
      'Contestar los mismos mensajes de siempre a las once de la noche',
      'Perder tardes enteras redactando informes y correos',
      'Cuadrar y recordar citas a mano por WhatsApp',
      'Tener las redes abandonadas, o publicar cosas que no suenan a ti',
      'El miedo a usar IA y acabar vulnerando el secreto profesional o la protección de datos',
      'La soledad de no tener con quién contrastar un caso difícil',
      'Sentir que la consulta depende de que tú estés disponible siempre',
    ],

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

    // Se muestra bajo el título «Qué obtendrás», tanto en la landing como en el
    // panel del alumno. Cada punto es algo que se lleva puesto al salir, no una
    // característica del taller.
    includes: [
      'Una guía clara para usar la IA sin comprometer tu ética profesional ni la protección de datos de tus pacientes',
      'Un segundo cerebro con el que contrastar tus casos y pensar en voz alta cuando no tienes con quién hacerlo',
      'Un asistente que escribe el contenido de tus redes manteniendo tu voz, no la de un robot',
      'Un asistente que te lleva la agenda y el calendario para que dejen de comerte las tardes',
      'Un asistente que redacta tus correos e informes en minutos, no en horas',
      'El método para automatizar tus tareas repetitivas sin escribir una sola línea de código',
      'La grabación completa del taller, para repasarla a tu ritmo cuando quieras',
      'Un mes de acompañamiento individual conmigo para alcanzar los objetivos que te marques durante la sesión',
    ],

    // Borrador genérico — edítalo cuando tengas el detalle definitivo.
    requirements: [
      'Acceso a un ordenador: las herramientas de IA que usaremos se manejan mucho mejor desde uno que desde el móvil',
      'Conexión a internet estable',
      'Cuenta de Google para entrar a Google Meet',
      'Unos 25€ para las herramientas de IA que usaremos, que contratas con tu propia cuenta (te explico cómo el mismo día)',
      'No necesitas conocimientos técnicos previos',
      'Recomendado: trae ejemplos reales de tu consulta (mensajes típicos de pacientes, cómo gestionas tu agenda) y, sobre todo, las tareas que más tiempo te roban, te rompen la concentración o te dan pereza: trabajaremos sobre ellas',
    ],

    faq: [
      {
        q: '¿Necesito saber de tecnología?',
        a: 'No. El taller está pensado para terapeutas, no para técnicos. Vamos paso a paso y nadie se queda atrás.',
      },
      {
        q: '¿Se graba la sesión?',
        a: 'Sí, y la grabación es tuya para repasarla cuando quieras. Aun así, reserva el día completo: es en directo y en grupo reducido, así que podrás preguntar por tu caso concreto, y eso no se recupera viendo el vídeo.',
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

// Trainings still sellable today: open for enrolment and not yet held. Nora uses
// this so she never pitches a workshop whose date has already passed.
export const open_trainings = (now = new Date()) =>
  Object.values(TRAININGS).filter(
    (t) => t.status === 'open' && new Date(`${t.date}T23:59:59`) >= now
  );

// Public-facing view. `meet_url` is intentionally omitted: it is only served to
// authenticated buyers through the portal (see private_training).
export const public_training = (t, { seats_taken = 0 } = {}) => {
  const seats_left = Math.max(t.capacity - seats_taken, 0);
  return {
    slug:            t.slug,
    name:            t.name,
    tagline:         t.tagline,
    audience:        t.audience,
    for_who:         t.for_who,
    not_for:         t.not_for,
    solves:          t.solves,
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
