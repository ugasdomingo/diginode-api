import ClientReport from '../models/client_report_model.js';
import Meeting from '../models/meeting_model.js';
import Invoice from '../models/invoice_model.js';
import Client from '../models/client_model.js';
import AgencyEvent from '../models/agency_event_model.js';
import { create_invoice_checkout_session } from '../services/stripe_service.js';
import {
  assert_client_access,
  assert_prospect_access,
  scoped_client_id,
} from '../agency/access.js';
import { clamp_pagination } from '../utils/pagination.js';
import http_error from '../utils/http_error.js';

const client_filter = (actor, requested) => {
  const scoped = scoped_client_id(actor, requested);
  return scoped ? { client_id: scoped } : {};
};

export const list_reports = async (req, res) => {
  const filter = client_filter(req.actor, req.query.client_id);
  if (typeof req.query.period === 'string') filter.period = req.query.period.slice(0, 7);
  const { limit, skip } = clamp_pagination(req.query);
  const [reports, total] = await Promise.all([
    ClientReport.find(filter).sort({ period: -1 }).skip(skip).limit(limit),
    ClientReport.countDocuments(filter),
  ]);
  res.json({ success: true, data: reports, total });
};

export const create_report = async (req, res) => {
  assert_client_access(req.actor, req.body.client_id);
  try {
    const report = await ClientReport.create(req.body);
    res.status(201).json({ success: true, data: report });
  } catch (err) {
    if (err?.code === 11000) throw http_error(409, 'Ya hay un informe de ese mes');
    throw err;
  }
};

export const patch_report = async (req, res) => {
  const report = await ClientReport.findById(req.params.report_id);
  if (!report) throw http_error(404, 'Informe no encontrado');
  assert_client_access(req.actor, report.client_id);
  Object.assign(report, req.body);
  await report.save();
  res.json({ success: true, data: report });
};

export const list_meetings = async (req, res) => {
  const filter = {};
  if (req.query.client_id || req.actor.role === 'client' || req.actor.client_ids?.length) {
    Object.assign(filter, client_filter(req.actor, req.query.client_id));
  } else if (req.actor.role !== 'admin' && req.actor.type !== 'bot') {
    assert_prospect_access(req.actor);
  }
  if (typeof req.query.lead_id === 'string') {
    assert_prospect_access(req.actor);
    filter.lead_id = req.query.lead_id;
  }
  const { limit, skip } = clamp_pagination(req.query);
  const [meetings, total] = await Promise.all([
    Meeting.find(filter).sort({ starts_at: -1 }).skip(skip).limit(limit),
    Meeting.countDocuments(filter),
  ]);
  res.json({ success: true, data: meetings, total });
};

export const create_meeting = async (req, res) => {
  const body = req.body;
  if (body.client_id) assert_client_access(req.actor, body.client_id);
  else assert_prospect_access(req.actor);
  const meeting = await Meeting.create({
    ...body,
    starts_at: body.starts_at ? new Date(body.starts_at) : undefined,
    ends_at: body.ends_at ? new Date(body.ends_at) : undefined,
  });
  res.status(201).json({ success: true, data: meeting });
};

export const patch_meeting = async (req, res) => {
  const meeting = await Meeting.findById(req.params.meeting_id);
  if (!meeting) throw http_error(404, 'Reunión no encontrada');
  if (meeting.client_id) assert_client_access(req.actor, meeting.client_id);
  else assert_prospect_access(req.actor);
  const body = { ...req.body };
  if (body.starts_at) body.starts_at = new Date(body.starts_at);
  if (body.ends_at) body.ends_at = new Date(body.ends_at);
  Object.assign(meeting, body);
  await meeting.save();
  res.json({ success: true, data: meeting });
};

export const list_invoices = async (req, res) => {
  const filter = client_filter(req.actor, req.query.client_id);
  if (typeof req.query.status === 'string') filter.status = req.query.status.slice(0, 20);
  const { limit, skip } = clamp_pagination(req.query);
  const [invoices, total] = await Promise.all([
    Invoice.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(filter),
  ]);
  res.json({ success: true, data: invoices, total });
};

export const create_invoice = async (req, res) => {
  assert_client_access(req.actor, req.body.client_id);
  if (!(await Client.exists({ _id: req.body.client_id })))
    throw http_error(404, 'Cliente no encontrado');
  const invoice = await Invoice.create({
    client_id: req.body.client_id,
    concept: req.body.concept,
    amount_eur: Math.round(req.body.amount_eur * 100) / 100,
    currency: 'EUR',
    status: req.body.status || 'pendiente',
  });
  res.status(201).json({ success: true, data: invoice });
};

export const checkout_invoice = async (req, res) => {
  const invoice = await Invoice.findById(req.params.invoice_id);
  if (!invoice) throw http_error(404, 'Factura no encontrada');
  assert_client_access(req.actor, invoice.client_id);
  if (invoice.status === 'pagada') throw http_error(409, 'La factura ya está pagada');
  if (invoice.status === 'anulada') throw http_error(409, 'La factura está anulada');
  if (invoice.payment_url && invoice.stripe_session_id && invoice.status === 'pendiente') {
    return res.json({
      success: true,
      data: { url: invoice.payment_url, session_id: invoice.stripe_session_id },
    });
  }
  const client = await Client.findById(invoice.client_id);
  const session = await create_invoice_checkout_session({ invoice, client });
  invoice.payment_url = session.url;
  invoice.stripe_session_id = session.session_id;
  invoice.status = 'pendiente';
  await invoice.save();
  res.json({
    success: true,
    data: { url: session.url, session_id: session.session_id, invoice_id: invoice._id },
  });
};

export const list_events = async (req, res) => {
  const filter = {};
  if (req.actor.type === 'bot' && req.actor.client_ids?.length) {
    if (req.query.client_id && !req.actor.client_ids.includes(String(req.query.client_id))) {
      throw http_error(403, 'Acceso denegado');
    }
    filter.client_id = req.query.client_id || { $in: req.actor.client_ids };
  } else if (typeof req.query.client_id === 'string') {
    filter.client_id = req.query.client_id;
  }
  if (typeof req.query.since === 'string' && !Number.isNaN(Date.parse(req.query.since))) {
    filter.created_at = { $gt: new Date(req.query.since) };
  }
  const events = await AgencyEvent.find(filter).sort({ created_at: -1 }).limit(50);
  res.json({ success: true, data: events });
};
