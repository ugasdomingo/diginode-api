import Client from '../models/client_model.js';
import ConsentVisit from '../models/consent_visit_model.js';
import Lead from '../models/lead_model.js';
import { link_visits_to_lead } from './consent_visit_service.js';
import { JOURNEY_EVENT_LIMIT, parse_visitor_id } from './measurement_fields.js';

const entry_of = (entry = {}) => ({
  referrer_domain: entry.referrer_domain || '',
  utm_source: entry.utm_source || '',
  utm_medium: entry.utm_medium || '',
  utm_campaign: entry.utm_campaign || '',
});

const timeline_key = (item) =>
  [
    item.type,
    item.path,
    item.contact_type || '',
    item.location || '',
    new Date(item.at).toISOString(),
  ].join('|');

const as_timeline = (item, origin) => {
  const entry = {
    type: item.type,
    path: item.path,
    at: new Date(item.at),
    origin,
  };
  if (item.contact_type) entry.contact_type = item.contact_type;
  if (item.location) entry.location = item.location;
  return entry;
};

const merge_timeline = (current, incoming) => {
  const map = new Map();
  for (const item of [...current, ...incoming]) {
    if (!item?.type || !item?.path || !item?.at) continue;
    const entry = as_timeline(item, item.origin || 'journey');
    map.set(timeline_key(entry), entry);
  }
  return [...map.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-JOURNEY_EVENT_LIMIT);
};

// Guarda el recorrido y engancha las visitas previas de dn_vid. Si la ficha ya
// tenía consentimiento, no se sustituye: un reintento no reescribe la prueba.
const attach_journey_if_consented = async (lead, { journey_consent, journey, visitor_id }) => {
  if (journey_consent?.accepted !== true) return lead;

  const id = parse_visitor_id(visitor_id);
  const already = await Lead.findById(lead._id).select('visitor_id journey_consent timeline').lean();
  if (already?.journey_consent?.accepted === true) {
    if (already.visitor_id) await link_visits_to_lead(already.visitor_id, lead._id);
    return Lead.findById(lead._id);
  }

  const visits = id ? await link_visits_to_lead(id, lead._id) : [];
  const from_form = (journey?.events ?? []).map((event) => ({ ...event, origin: 'journey' }));
  const from_visits = visits.map((visit) => ({
    type: visit.type,
    path: visit.path,
    at: visit.created_at,
    contact_type: visit.contact_type,
    location: visit.location,
    origin: 'visit',
  }));

  const consent = {
    accepted: true,
    text_version: journey_consent.text_version,
    at: new Date(journey_consent.at),
  };
  if (journey_consent.text) consent.text = journey_consent.text;

  const set = {
    journey_consent: consent,
    journey_entry: entry_of(journey?.entry),
    timeline: merge_timeline(already?.timeline ?? [], [...from_form, ...from_visits]),
  };
  if (id) set.visitor_id = id;

  const updated = await Lead.findOneAndUpdate(
    { _id: lead._id, 'journey_consent.accepted': { $ne: true } },
    { $set: set },
    { new: true }
  );
  return updated || Lead.findById(lead._id);
};

// Al convertir, la ficha de cliente se queda con una copia del recorrido y las
// visitas pasan a apuntar también al cliente, sin volver a ponerles caducidad.
const copy_journey_to_client = async (lead, client) => {
  const set = {};
  if (lead.visitor_id) set.visitor_id = lead.visitor_id;
  if (lead.journey_consent) set.journey_consent = lead.journey_consent;
  if (lead.journey_entry) set.journey_entry = lead.journey_entry;
  if (lead.timeline?.length) set.timeline = lead.timeline;
  const current = Object.keys(set).length
    ? await Client.findByIdAndUpdate(client._id, { $set: set }, { new: true })
    : client;
  await ConsentVisit.updateMany(
    { lead_id: lead._id },
    { $set: { client_id: client._id }, $unset: { expires_at: '' } }
  );
  return current;
};

export { attach_journey_if_consented, copy_journey_to_client, merge_timeline };
