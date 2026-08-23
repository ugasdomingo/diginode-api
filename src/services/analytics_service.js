import { createHash } from 'crypto';
import PageView from '../models/pageview_model.js';

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

// Sólo se miden páginas públicas. El panel de cliente y el de admin no se tocan.
const PRIVATE_PREFIXES = ['/portal', '/admin', '/login', '/cambiar-contrasena'];

const is_public_path = (path) =>
  typeof path === 'string' &&
  path.startsWith('/') &&
  path.length <= 200 &&
  !PRIVATE_PREFIXES.some((p) => path.startsWith(p));

// ── Registro ────────────────────────────────────────────────────────────────

const record_view = async ({ path, referrer, session_id, ip, user_agent }) => {
  if (!is_public_path(path) || !session_id) return null;

  // La ruta se guarda sin parámetros: ?session_id=… de Stripe jamás debe acabar aquí.
  const clean_path = path.split('?')[0].split('#')[0];

  return PageView.create({
    visitor_hash: hash_visitor(ip, user_agent),
    session_id,
    path: clean_path,
    source: classify_source(referrer),
    device: classify_device(user_agent),
  });
};

// Segundo aviso, al salir de la página: cuánto tiempo estuvo visible.
// Se aplica sobre la visita más reciente de esa pestaña y esa ruta.
const record_duration = async ({ session_id, path, seconds }) => {
  if (!session_id || !is_public_path(path)) return null;

  const clean_path = path.split('?')[0].split('#')[0];
  // Tope de 2 horas: una pestaña olvidada abierta no debe inflar la media.
  const capped = Math.min(Math.max(Number(seconds) || 0, 0), 7200);

  return PageView.findOneAndUpdate(
    { session_id, path: clean_path },
    { $max: { duration_seconds: capped } },
    { sort: { created_at: -1 } }
  );
};

// Hito de conversión sobre la visita en curso.
const record_event = async ({ session_id, path, event }) => {
  if (!session_id || !['checkout_click', 'purchase'].includes(event)) return null;

  const clean_path = (path ?? '').split('?')[0].split('#')[0];

  return PageView.findOneAndUpdate(
    { session_id, ...(is_public_path(clean_path) ? { path: clean_path } : {}) },
    { $addToSet: { events: event } },
    { sort: { created_at: -1 } }
  );
};

// ── Consulta para el panel ──────────────────────────────────────────────────

const get_summary = async ({ days = 30 } = {}) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const match = { created_at: { $gte: since } };

  const [totals, by_day, by_path, by_source, by_device, funnel] = await Promise.all([
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
  ]);

  const t = totals[0] ?? {};
  const f = funnel[0] ?? {};
  const landing_views = f.views ?? 0;

  return {
    range_days: days,
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

export { record_view, record_duration, record_event, get_summary, classify_source, classify_device, is_public_path };
