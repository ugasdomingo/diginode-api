import { createHash } from 'crypto';
import Lead from '../models/lead_model.js';
import PageView from '../models/pageview_model.js';
import { record_consent_visit } from './consent_visit_service.js';
import {
  ALLOWED_EVENTS,
  CONTACT_EVENTS,
  CONTACT_LOCATIONS,
  CONTACT_TYPE_BY_EVENT,
  is_public_path,
} from './measurement_fields.js';

// ── Anonimización ───────────────────────────────────────────────────────────

// La sal cambia cada día natural. Es lo que impide reconstruir el recorrido de
// una persona entre días: el mismo visitante genera un hash distinto mañana.
// ANALYTICS_SALT sólo añade un secreto propio para que nadie de fuera pueda
// recalcular los hashes probando IPs.
const daily_salt = (now = new Date()) => {
  const day = now.toISOString().slice(0, 10);
  return `${process.env.ANALYTICS_SALT ?? 'diginode'}:${day}`;
};

// Hash irreversible del visitante. La IP entra aquí y no sale ni se guarda.
const hash_visitor = (ip, user_agent) =>
  createHash('sha256').update(`${ip ?? ''}|${user_agent ?? ''}|${daily_salt()}`).digest('hex');

// ── Clasificadores ──────────────────────────────────────────────────────────

// Sólo el canal, nunca la URL de procedencia completa: puede llevar datos
// personales en los parámetros de búsqueda.
const classify_source = (referrer) => {
  if (!referrer) return 'directo';

  let host;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'otro';
  }
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('facebook') || host.includes('fb.')) return 'facebook';
  if (host.includes('google')) return 'google';
  if (host.includes('whatsapp') || host.includes('wa.me')) return 'whatsapp';
  // El propio sitio no cuenta como origen externo.
  if (host.includes('midiginode')) return 'directo';
  return 'otro';
};

const classify_device = (user_agent = '') => {
  const ua = user_agent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'movil';
  return 'escritorio';
};

// ── Registro ────────────────────────────────────────────────────────────────

// Ubicación sólo en los hitos de contacto, y sólo si está en la lista cerrada.
const normalize_event_location = (event, location) => {
  if (!ALLOWED_EVENTS.includes(event)) return null;
  const omitted = location === undefined || location === null || location === '';
  if (omitted) return { event, location: null };
  if (typeof location !== 'string' || !CONTACT_LOCATIONS.includes(location)) return null;
  if (!CONTACT_EVENTS.includes(event)) return null;
  return { event, location };
};

const record_view = async ({ path, referrer, session_id, ip, user_agent, visitor_id }) => {
  if (!is_public_path(path) || typeof session_id !== 'string' || session_id.length > 100) return null;

  // La ruta se guarda sin parámetros: ?session_id=… de Stripe jamás debe acabar aquí.
  const clean_path = path.split('?')[0].split('#')[0];

  const saved = await PageView.create({
    visitor_hash: hash_visitor(ip, user_agent),
    session_id,
    path: clean_path,
    source: classify_source(referrer),
    device: classify_device(user_agent),
  });

  // La copia con cookie no hereda la IP ni el user-agent: vive en otra colección.
  await record_consent_visit({ visitor_id, type: 'pageview', path: clean_path });
  return saved;
};

// Segundo aviso, al salir de la página: cuánto tiempo estuvo visible.
// Se aplica sobre la visita más reciente de esa pestaña y esa ruta.
const record_duration = async ({ session_id, path, seconds }) => {
  if (typeof session_id !== 'string' || session_id.length > 100 || !is_public_path(path)) return null;

  const clean_path = path.split('?')[0].split('#')[0];
  // Tope de 2 horas: una pestaña olvidada abierta no debe inflar la media.
  const capped = Math.min(Math.max(Number(seconds) || 0, 0), 7200);

  return PageView.findOneAndUpdate(
    { session_id, path: clean_path },
    { $max: { duration_seconds: capped } },
    { sort: { created_at: -1 } }
  );
};

// Hito de conversión sobre la visita en curso. `visitor_id` es la cookie propia
// dn_vid: si viene y es un UUID v4, el hito se guarda también aparte, sin IP.
const record_event = async ({ session_id, path, event, location, visitor_id }) => {
  if (typeof session_id !== 'string' || session_id.length > 100) return null;
  const accepted = normalize_event_location(event, location);
  if (!accepted) return null;

  const clean_path = (path ?? '').split('?')[0].split('#')[0];
  const update = { $addToSet: { events: accepted.event } };
  if (accepted.location) {
    update.$addToSet.contact_locations = { event: accepted.event, location: accepted.location };
  }

  const saved = await PageView.findOneAndUpdate(
    { session_id, ...(is_public_path(clean_path) ? { path: clean_path } : {}) },
    update,
    { sort: { created_at: -1 } }
  );

  await record_consent_visit({
    visitor_id,
    type: CONTACT_TYPE_BY_EVENT[accepted.event] ? 'contact_click' : accepted.event,
    event: accepted.event,
    path: clean_path,
    contact_type: CONTACT_TYPE_BY_EVENT[accepted.event] || '',
    location: accepted.location || '',
  });
  return saved;
};

// ── Consulta para el panel ──────────────────────────────────────────────────

const contact_breakdown = async (match) => {
  const names = ['contact_call_click', 'contact_whatsapp_click', 'contact_form_submit'];
  const [events, locations] = await Promise.all([
    PageView.aggregate([
      { $match: { ...match, events: { $in: names } } },
      { $unwind: '$events' },
      { $match: { events: { $in: names } } },
      { $group: { _id: '$events', count: { $sum: 1 } } },
    ]),
    PageView.aggregate([
      { $match: match },
      { $unwind: '$contact_locations' },
      {
        $group: {
          _id: { event: '$contact_locations.event', location: '$contact_locations.location' },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, event: '$_id.event', location: '$_id.location', count: 1 } },
      { $sort: { count: -1 } },
    ]),
  ]);
  const count_of = (name) => events.find((row) => row._id === name)?.count ?? 0;
  return {
    call_clicks: count_of('contact_call_click'),
    whatsapp_clicks: count_of('contact_whatsapp_click'),
    form_submits: count_of('contact_form_submit'),
    by_location: locations,
  };
};

const get_summary = async ({ days = 30 } = {}) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const match = { created_at: { $gte: since } };

  const [totals, by_day, by_path, by_source, by_device, funnel, by_offer, business_funnel, contact_events] = await Promise.all([
    PageView.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          views: { $sum: 1 },
          visitors: { $addToSet: '$visitor_hash' },
          sessions: { $addToSet: '$session_id' },
          // La media de permanencia sólo tiene sentido sobre las visitas que
          // llegaron a reportar duración; incluir los ceros la hundiría.
          measured: { $sum: { $cond: [{ $gt: ['$duration_seconds', 0] }, 1, 0] } },
          total_seconds: { $sum: '$duration_seconds' },
        },
      },
    ]),

    PageView.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          views: { $sum: 1 },
          visitors: { $addToSet: '$visitor_hash' },
        },
      },
      { $project: { _id: 0, date: '$_id', views: 1, visitors: { $size: '$visitors' } } },
      { $sort: { date: 1 } },
    ]),

    PageView.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$path',
          views: { $sum: 1 },
          visitors: { $addToSet: '$visitor_hash' },
          measured: { $sum: { $cond: [{ $gt: ['$duration_seconds', 0] }, 1, 0] } },
          total_seconds: { $sum: '$duration_seconds' },
        },
      },
      {
        $project: {
          _id: 0,
          path: '$_id',
          views: 1,
          visitors: { $size: '$visitors' },
          avg_seconds: {
            $cond: [{ $gt: ['$measured', 0] }, { $divide: ['$total_seconds', '$measured'] }, 0],
          },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 20 },
    ]),

    PageView.aggregate([
      { $match: match },
      { $group: { _id: '$source', views: { $sum: 1 }, visitors: { $addToSet: '$visitor_hash' } } },
      { $project: { _id: 0, source: '$_id', views: 1, visitors: { $size: '$visitors' } } },
      { $sort: { views: -1 } },
    ]),

    PageView.aggregate([
      { $match: match },
      { $group: { _id: '$device', views: { $sum: 1 } } },
      { $project: { _id: 0, device: '$_id', views: 1 } },
      { $sort: { views: -1 } },
    ]),

    // Embudo de la landing del taller: visitas → clics en comprar → compras.
    PageView.aggregate([
      { $match: { ...match, path: '/formacion/ia-para-terapeutas' } },
      {
        $group: {
          _id: null,
          views: { $sum: 1 },
          visitors: { $addToSet: '$visitor_hash' },
          checkout_clicks: { $sum: { $cond: [{ $in: ['checkout_click', '$events'] }, 1, 0] } },
          purchases: { $sum: { $cond: [{ $in: ['purchase', '$events'] }, 1, 0] } },
        },
      },
    ]),
    PageView.aggregate([{ $match: { ...match, path: { $in: ['/', '/clinica-digital', '/webs-y-aplicaciones'] } } }, { $group: { _id: '$path', views: { $sum: 1 }, cta_clicks: { $sum: { $cond: [{ $in: ['lead_cta_click', '$events'] }, 1, 0] } }, submitted_events: { $sum: { $cond: [{ $in: ['lead_submit_success', '$events'] }, 1, 0] } }, demos: { $sum: { $cond: [{ $in: ['demo_start', '$events'] }, 1, 0] } }, booking_clicks: { $sum: { $cond: [{ $in: ['booking_click', '$events'] }, 1, 0] } } } }]),
    Lead.aggregate([{ $match: match }, { $group: { _id: '$service_interest', requests: { $sum: { $cond: [{ $eq: ['$source', 'web_form'] }, 1, 0] } }, qualified: { $sum: { $cond: [{ $and: [{ $eq: ['$source', 'web_form'] }, { $in: ['$status', ['qualified', 'meeting_booked', 'won']] }] }, 1, 0] } }, confirmed_meetings: { $sum: { $cond: [{ $ifNull: ['$cal_booking_id', false] }, 1, 0] } }, won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } } } }]),
    contact_breakdown(match),
  ]);

  const t = totals[0] ?? {};
  const f = funnel[0] ?? {};
  const landing_views = f.views ?? 0;

  return {
    range_days: days,
    by_offer, business_funnel,
    totals: {
      views:        t.views ?? 0,
      visitors:     t.visitors?.length ?? 0,
      sessions:     t.sessions?.length ?? 0,
      avg_seconds:  t.measured > 0 ? Math.round(t.total_seconds / t.measured) : 0,
    },
    by_day,
    by_path:   by_path.map((p) => ({ ...p, avg_seconds: Math.round(p.avg_seconds) })),
    by_source,
    by_device,
    contact_events,
    landing_funnel: {
      views:            landing_views,
      visitors:         f.visitors?.length ?? 0,
      checkout_clicks:  f.checkout_clicks ?? 0,
      purchases:        f.purchases ?? 0,
      click_rate:    landing_views ? +(((f.checkout_clicks ?? 0) / landing_views) * 100).toFixed(1) : 0,
      purchase_rate: landing_views ? +(((f.purchases ?? 0)        / landing_views) * 100).toFixed(1) : 0,
    },
  };
};

export {
  record_view,
  record_duration,
  record_event,
  get_summary,
  classify_source,
  classify_device,
  is_public_path,
  normalize_event_location,
};
