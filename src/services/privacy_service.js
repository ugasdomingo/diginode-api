import Client from '../models/client_model.js';
import ConsentVisit from '../models/consent_visit_model.js';
import Lead from '../models/lead_model.js';
import PrivacyAudit from '../models/privacy_audit_model.js';
import { delete_visits } from './consent_visit_service.js';
import { parse_visitor_id } from './measurement_fields.js';

const not_found = (message) => Object.assign(new Error(message), { status_code: 404 });

const TRACKING_UNSET = {
  visitor_id: '',
  journey_consent: '',
  journey_entry: '',
  timeline: '',
};

const visit_view = (visit) => ({
  id: visit._id,
  visitor_id: visit.visitor_id,
  type: visit.type,
  event: visit.event || null,
  path: visit.path,
  contact_type: visit.contact_type || null,
  location: visit.location || null,
  at: visit.created_at,
  linked_at: visit.linked_at || null,
});

const lead_view = (lead) => ({
  id: lead._id,
  name: lead.name || null,
  email: lead.email || null,
  phone: lead.phone || null,
  company: lead.company || null,
  website: lead.website || null,
  country: lead.country || null,
  business_type: lead.business_type || null,
  service_interest: lead.service_interest || null,
  requested_scale: lead.requested_scale || null,
  goal: lead.goal || null,
  budget_range: lead.budget_range || null,
  landing_path: lead.landing_path || null,
  attribution: lead.attribution || null,
  source: lead.source || null,
  status: lead.status || null,
  funnel_stage: lead.funnel_stage || null,
  platform: lead.platform || null,
  contact_id: lead.contact_id || null,
  request_id: lead.request_id || null,
  privacy_version: lead.privacy_version || null,
  privacy_acknowledged: lead.privacy_acknowledged ?? null,
  privacy_shown_at: lead.privacy_shown_at || null,
  marketing_authorized_at: lead.marketing_authorized_at || null,
  marketing_offer: lead.marketing_offer || null,
  cal_booking_id: lead.cal_booking_id || null,
  internal_notes: lead.internal_notes || null,
  chat_history: lead.chat_history || [],
  visitor_id: lead.visitor_id || null,
  journey_consent: lead.journey_consent || null,
  journey_entry: lead.journey_entry || null,
  timeline: lead.timeline || [],
  created_at: lead.created_at,
  updated_at: lead.updated_at,
});

const client_view = (client) => {
  const form = client.onboarding_form
    ? {
        business_name: client.onboarding_form.business_name,
        sector: client.onboarding_form.sector,
        timezone: client.onboarding_form.timezone,
        locale: client.onboarding_form.locale,
        slack_workspace: client.onboarding_form.slack_workspace,
        slack_default_channel: client.onboarding_form.slack_default_channel,
        materials_link: client.onboarding_form.materials_link,
        additional_notes: client.onboarding_form.additional_notes,
        submitted_at: client.onboarding_form.submitted_at,
      }
    : null;
  return {
    id: client._id,
    name: client.name,
    email: client.email,
    company: client.company || null,
    country: client.country || null,
    plan: client.plan,
    status: client.status,
    onboarding_status: client.onboarding_status,
    services: client.services || [],
    active_employees: client.active_employees || [],
    office_url: client.office_url || null,
    office_status: client.office_status || null,
    lead_id: client.lead_id || null,
    onboarding_form: form,
    visitor_id: client.visitor_id || null,
    journey_consent: client.journey_consent || null,
    journey_entry: client.journey_entry || null,
    timeline: client.timeline || [],
    created_at: client.created_at,
    updated_at: client.updated_at,
  };
};

const record_audit = async ({ action, subject_type, subject_id, actor_id }) => {
  await PrivacyAudit.create({
    action,
    subject_type,
    subject_id: String(subject_id),
    actor_id,
    at: new Date(),
  });
};

const visits_for = async ({ lead_id, client_id, visitor_id }) => {
  const ors = [];
  if (lead_id) ors.push({ lead_id });
  if (client_id) ors.push({ client_id });
  const id = parse_visitor_id(visitor_id);
  if (id) ors.push({ visitor_id: id });
  if (!ors.length) return [];
  const visits = await ConsentVisit.find({ $or: ors }).sort({ created_at: 1 }).limit(500).lean();
  return visits.map(visit_view);
};

const export_lead = async (lead_id, actor_id) => {
  const lead = await Lead.findById(lead_id).lean();
  if (!lead) throw not_found('Lead no encontrado');
  const client = await Client.findOne({ lead_id: lead._id }).lean();
  const data = {
    exported_at: new Date(),
    subject: { type: 'lead', id: lead._id },
    lead: lead_view(lead),
    client: client ? client_view(client) : null,
    visits: await visits_for({
      lead_id: lead._id,
      client_id: client?._id,
      visitor_id: lead.visitor_id || client?.visitor_id,
    }),
  };
  await record_audit({ action: 'export', subject_type: 'lead', subject_id: lead._id, actor_id });
  return data;
};

const export_client = async (client_id, actor_id) => {
  const client = await Client.findById(client_id).lean();
  if (!client) throw not_found('Cliente no encontrado');
  const lead = client.lead_id ? await Lead.findById(client.lead_id).lean() : null;
  const data = {
    exported_at: new Date(),
    subject: { type: 'client', id: client._id },
    lead: lead ? lead_view(lead) : null,
    client: client_view(client),
    visits: await visits_for({
      lead_id: lead?._id,
      client_id: client._id,
      visitor_id: client.visitor_id || lead?.visitor_id,
    }),
  };
  await record_audit({ action: 'export', subject_type: 'client', subject_id: client._id, actor_id });
  return data;
};

const clear_people = async ({ lead_ids = [], client_ids = [] }) => {
  if (lead_ids.length) await Lead.updateMany({ _id: { $in: lead_ids } }, { $unset: TRACKING_UNSET });
  if (client_ids.length) await Client.updateMany({ _id: { $in: client_ids } }, { $unset: TRACKING_UNSET });
};

const erase_lead_tracking = async (lead_id, actor_id) => {
  const lead = await Lead.findById(lead_id);
  if (!lead) throw not_found('Lead no encontrado');
  const clients = await Client.find({ lead_id: lead._id }).select('_id visitor_id');
  const visitor_ids = [lead.visitor_id, ...clients.map((client) => client.visitor_id)].filter(Boolean);
  let visits = await delete_visits({ visitor_ids, lead_id: lead._id });
  for (const client of clients) visits += await delete_visits({ client_id: client._id });
  await clear_people({ lead_ids: [lead._id], client_ids: clients.map((client) => client._id) });
  await record_audit({ action: 'erase', subject_type: 'lead', subject_id: lead._id, actor_id });
  return { visits, leads: 1, clients: clients.length };
};

const erase_client_tracking = async (client_id, actor_id) => {
  const client = await Client.findById(client_id);
  if (!client) throw not_found('Cliente no encontrado');
  const lead = client.lead_id ? await Lead.findById(client.lead_id) : null;
  const visitor_ids = [client.visitor_id, lead?.visitor_id].filter(Boolean);
  const visits = await delete_visits({
    visitor_ids,
    lead_id: lead?._id,
    client_id: client._id,
  });
  await clear_people({
    lead_ids: lead ? [lead._id] : [],
    client_ids: [client._id],
  });
  await record_audit({ action: 'erase', subject_type: 'client', subject_id: client._id, actor_id });
  return { visits, leads: lead ? 1 : 0, clients: 1 };
};

// Borra la cookie aunque no haya ficha. También limpia el recorrido de quien
// la tuviera guardada, sin borrar el resto de la ficha.
const erase_visitor = async (visitor_id, actor_id) => {
  const id = parse_visitor_id(visitor_id);
  if (!id) {
    throw Object.assign(new Error('Identificador de visitante no válido'), { status_code: 400 });
  }
  const leads = await Lead.find({ visitor_id: id }).select('_id');
  const clients = await Client.find({ visitor_id: id }).select('_id');
  const visits = await delete_visits({
    visitor_ids: [id],
    lead_id: undefined,
    client_id: undefined,
  });
  await clear_people({
    lead_ids: leads.map((lead) => lead._id),
    client_ids: clients.map((client) => client._id),
  });
  await record_audit({ action: 'erase', subject_type: 'visitor', subject_id: id, actor_id });
  return { visits, leads: leads.length, clients: clients.length };
};

// Al borrar la ficha entera desde el panel, no pueden quedar visitas vinculadas
// sin caducidad ni una copia del recorrido en el cliente.
const purge_tracking_for_deleted_lead = async (lead) => {
  const clients = await Client.find({ lead_id: lead._id }).select('_id');
  await delete_visits({
    visitor_ids: lead.visitor_id ? [lead.visitor_id] : [],
    lead_id: lead._id,
  });
  for (const client of clients) await delete_visits({ client_id: client._id });
  await clear_people({ client_ids: clients.map((client) => client._id) });
};

export {
  erase_client_tracking,
  erase_lead_tracking,
  erase_visitor,
  export_client,
  export_lead,
  purge_tracking_for_deleted_lead,
};
