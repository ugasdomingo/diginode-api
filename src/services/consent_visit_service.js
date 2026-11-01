import ConsentVisit from '../models/consent_visit_model.js';
import {
  RETENTION_MONTHS,
  add_months,
  parse_path,
  parse_visitor_id,
} from './measurement_fields.js';

// Alta de una visita con cookie dn_vid. El documento se construye campo a campo:
// no hay sitio para la IP, el user-agent ni la sesión.
const record_consent_visit = async ({
  visitor_id,
  type,
  event,
  path,
  contact_type,
  location,
  at,
}) => {
  const id = parse_visitor_id(visitor_id);
  const clean_path = parse_path(path ?? '');
  if (!id || !clean_path || typeof type !== 'string' || !type) return null;

  const created_at = at instanceof Date ? at : new Date();
  const doc = {
    visitor_id: id,
    type,
    path: clean_path,
    contact_type: contact_type || '',
    location: location || '',
    expires_at: add_months(created_at, RETENTION_MONTHS),
    created_at,
  };
  if (event) doc.event = event;
  return ConsentVisit.create(doc);
};

// Pasa las visitas sueltas de esa cookie a la ficha y les quita la caducidad.
const link_visits_to_lead = async (visitor_id, lead_id) => {
  const id = parse_visitor_id(visitor_id);
  if (!id || !lead_id) return [];

  // Se vinculan todas, no sólo las que caben en el timeline. El timeline se queda
  // con las 200 más recientes; la exportación lee la colección.
  await ConsentVisit.updateMany(
    { visitor_id: id, lead_id: null },
    { $set: { lead_id, linked_at: new Date() }, $unset: { expires_at: '' } }
  );
  return ConsentVisit.find({ visitor_id: id, lead_id })
    .sort({ created_at: -1 })
    .limit(200)
    .lean();
};

const delete_visits = async ({ visitor_ids = [], lead_id, client_id } = {}) => {
  const ors = [];
  if (lead_id) ors.push({ lead_id });
  if (client_id) ors.push({ client_id });
  const ids = visitor_ids.map(parse_visitor_id).filter(Boolean);
  if (ids.length) ors.push({ visitor_id: { $in: ids } });
  if (!ors.length) return 0;
  const result = await ConsentVisit.deleteMany({ $or: ors });
  return result.deletedCount ?? 0;
};

export { delete_visits, link_visits_to_lead, record_consent_visit };
