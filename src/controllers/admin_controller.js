import Lead from '../models/lead_model.js';
import Client from '../models/client_model.js';
import ContentGrid from '../models/content_grid_model.js';
import SupportTicket from '../models/support_ticket_model.js';
import { generate_content_grid } from '../services/content_manager_service.js';
import { design_post } from '../services/disenador_service.js';
import { analyze_meeting } from '../services/ingeniero_service.js';
import { convert_lead_to_client } from '../services/crm_service.js';

// GET /api/admin/dashboard
const get_dashboard = async (_req, res, next) => {
  try {
    const [total_leads, total_clients, open_tickets, content_drafts] = await Promise.all([
      Lead.countDocuments(),
      Client.countDocuments({ status: 'active' }),
      SupportTicket.countDocuments({ status: { $in: ['open', 'pending_review'] } }),
      ContentGrid.countDocuments({ status: 'draft' }),
    ]);

    res.json({
      success: true,
      data: { total_leads, total_clients, open_tickets, content_drafts },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/leads
const get_leads = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [leads, total] = await Promise.all([
      Lead.find(filter).select('-chat_history').sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
      Lead.countDocuments(filter),
    ]);

    res.json({ success: true, data: leads, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/leads/:lead_id
const update_lead = async (req, res, next) => {
  try {
    const { lead_id } = req.params;
    const { status } = req.body;

    const allowed_statuses = ['new', 'in_conversation', 'qualified', 'meeting_booked', 'won', 'lost'];
    if (!allowed_statuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const lead = await Lead.findByIdAndUpdate(lead_id, { status }, { new: true }).select('-chat_history');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/leads/:lead_id/convert
const convert_lead = async (req, res, next) => {
  try {
    const { lead_id } = req.params;
    const client = await convert_lead_to_client(lead_id, req.body);
    res.status(201).json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/content/generate
const generate_content = async (req, res, next) => {
  try {
    const { theme } = req.body;

    if (!theme) {
      return res.status(400).json({ success: false, message: 'theme is required' });
    }

    const posts = await generate_content_grid(theme);
    res.status(201).json({ success: true, data: posts });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/content/:content_id/design
const design_content = async (req, res, next) => {
  try {
    const { content_id } = req.params;
    const post = await design_post(content_id);
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/content
const get_content = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [posts, total] = await Promise.all([
      ContentGrid.find(filter).sort({ scheduled_for: 1 }).skip(skip).limit(Number(limit)),
      ContentGrid.countDocuments(filter),
    ]);

    res.json({ success: true, data: posts, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/content/:content_id
const update_content = async (req, res, next) => {
  try {
    const { content_id } = req.params;
    const { status, copy } = req.body;

    const allowed_statuses = ['draft', 'approved', 'rejected'];
    if (status && !allowed_statuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const update = {};
    if (status) update.status = status;
    if (copy) update.copy = copy;

    const post = await ContentGrid.findByIdAndUpdate(content_id, update, { new: true });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Content post not found' });
    }

    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/sales/analyze
const analyze_sales = async (req, res, next) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ success: false, message: 'transcript is required' });
    }

    const analysis = await analyze_meeting(transcript);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
};

export {
  get_dashboard,
  get_leads,
  update_lead,
  convert_lead,
  generate_content,
  design_content,
  get_content,
  update_content,
  analyze_sales,
};
