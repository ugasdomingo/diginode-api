import { randomUUID } from 'node:crypto';
import Lead from '../models/lead_model.js';
import { assert_prospect_access } from '../agency/access.js';
import { present_lead } from '../agency/present.js';
import { clamp_pagination } from '../utils/pagination.js';
import http_error from '../utils/http_error.js';

const LEAD_LIST = '-chat_history -demo_lock_token -demo_lock_until -request_hash -activity';

const not_erased = { erased_at: null };

export const list_leads = async (req, res) => {
  assert_prospect_access(req.actor);
  const filter = { ...not_erased };
  if (req.actor.role === 'admin' && req.query.include_erased === '1') delete filter.erased_at;
  if (typeof req.query.pipeline_status === 'string')
    filter.pipeline_status = req.query.pipeline_status.slice(0, 40);
  if (typeof req.query.source === 'string') filter.source = req.query.source.slice(0, 40);
  const { limit, skip } = clamp_pagination(req.query);
  const [leads, total] = await Promise.all([
    Lead.find(filter).select(LEAD_LIST).sort({ updated_at: -1 }).skip(skip).limit(limit),
    Lead.countDocuments(filter),
  ]);
  res.json({ success: true, data: leads.map(present_lead), total });
};

export const create_lead = async (req, res) => {
  assert_prospect_access(req.actor);
  const body = req.body;
  const lead = await Lead.create({
    contact_id: `agencia_${randomUUID()}`,
    platform: 'agencia',
    company: body.business,
    name: body.name,
    email: body.email,
    phone: body.phone,
    website: body.website,
    links: body.links,
    source: body.source || 'manual',
    origin_detail: body.origin_detail,
    pipeline_status: body.pipeline_status || 'nuevo',
    service_interest: body.service_interest,
    next_action: body.next_action,
    next_action_at: body.next_action_at ? new Date(body.next_action_at) : undefined,
    internal_notes: body.internal_notes,
    status: 'new',
    funnel_stage: 'request_received',
  });
  res.status(201).json({ success: true, data: present_lead(lead) });
};

export const get_lead = async (req, res) => {
  assert_prospect_access(req.actor);
  const lead = await Lead.findById(req.params.lead_id).select('-demo_lock_token -request_hash');
  if (!lead || (lead.erased_at && req.actor.role !== 'admin')) {
    throw http_error(404, 'Lead no encontrado');
  }
  res.json({ success: true, data: present_lead(lead) });
};

export const patch_lead = async (req, res) => {
  assert_prospect_access(req.actor);
  const body = req.body;
  const update = {};
  if (body.business !== undefined) update.company = body.business;
  for (const key of [
    'name',
    'email',
    'phone',
    'website',
    'links',
    'source',
    'origin_detail',
    'pipeline_status',
    'service_interest',
    'next_action',
    'internal_notes',
  ]) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.next_action_at !== undefined) update.next_action_at = new Date(body.next_action_at);
  const lead = await Lead.findOneAndUpdate({ _id: req.params.lead_id, ...not_erased }, update, {
    new: true,
    runValidators: true,
  }).select('-chat_history -demo_lock_token -request_hash');
  if (!lead) throw http_error(404, 'Lead no encontrado');
  res.json({ success: true, data: present_lead(lead) });
};

export const add_activity = async (req, res) => {
  assert_prospect_access(req.actor);
  const body = req.body;
  const entry = {
    type: body.type,
    summary: body.summary,
    at: body.at ? new Date(body.at) : new Date(),
    actor: req.actor.label,
  };
  const update = { $push: { activity: { $each: [entry], $slice: -200 } } };
  if (body.type === 'siguiente_accion' || body.next_action) {
    update.$set = {
      next_action: body.next_action || body.summary,
      ...(body.next_action_at ? { next_action_at: new Date(body.next_action_at) } : {}),
    };
  }
  const lead = await Lead.findOneAndUpdate({ _id: req.params.lead_id, ...not_erased }, update, {
    new: true,
  }).select('-chat_history -demo_lock_token -request_hash');
  if (!lead) throw http_error(404, 'Lead no encontrado');
  res.json({ success: true, data: present_lead(lead) });
};
