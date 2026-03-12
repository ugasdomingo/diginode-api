import Lead from '../models/lead_model.js';
import Client from '../models/client_model.js';
import SupportTicket from '../models/support_ticket_model.js';
import Campaign from '../models/campaign_model.js';
import BlogPost from '../models/blog_post_model.js';
import { analyze_meeting } from '../services/ingeniero_service.js';
import { convert_lead_to_client } from '../services/crm_service.js';

// GET /api/admin/dashboard
const get_dashboard = async (_req, res, next) => {
  try {
    const [total_leads, total_clients, open_tickets, content_drafts] = await Promise.all([
      Lead.countDocuments(),
      Client.countDocuments({ status: 'active' }),
      SupportTicket.countDocuments({ status: { $in: ['open', 'pending_review'] } }),
      Campaign.countDocuments({ status: 'pending' }),
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

// ─── Content Campaigns ────────────────────────────────────────────────────────

// POST /api/admin/content/generate
// Creates a campaign and fires the Make.com webhook asynchronously
const generate_content = async (req, res, next) => {
  try {
    const { name, context } = req.body;

    if (!name || !context) {
      return res.status(400).json({ success: false, message: 'name and context are required' });
    }

    const campaign = await Campaign.create({ name, context });

    // Fire-and-forget: trigger Make.com scenario without blocking the response
    fetch(process.env.MAKE_CONTENT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaign._id.toString(), name, context }),
    }).catch((err) => console.error('[Make content webhook error]', err.message));

    res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/content/campaigns
const get_campaigns = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [campaigns, total] = await Promise.all([
      Campaign.find().sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
      Campaign.countDocuments(),
    ]);

    res.json({ success: true, data: campaigns, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/content/campaigns/:campaign_id
const update_campaign = async (req, res, next) => {
  try {
    const { campaign_id } = req.params;
    const { status } = req.body;

    const allowed = ['pending', 'proposal_ready', 'approved', 'in_production'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const campaign = await Campaign.findByIdAndUpdate(campaign_id, { status }, { new: true });

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaign });
  } catch (err) {
    next(err);
  }
};

// ─── Blog Admin ───────────────────────────────────────────────────────────────

const slugify = (title) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') +
  '-' +
  Date.now().toString(36);

// GET /api/admin/blog
const get_admin_posts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [posts, total] = await Promise.all([
      BlogPost.find().sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
      BlogPost.countDocuments(),
    ]);

    res.json({ success: true, data: posts, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/blog
const create_post = async (req, res, next) => {
  try {
    const { title, content, excerpt, thumbnail_url, status } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const slug = slugify(title);
    const published_at = status === 'published' ? new Date() : null;

    const post = await BlogPost.create({ title, slug, content, excerpt, thumbnail_url, status, published_at });
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/blog/:post_id
const update_post = async (req, res, next) => {
  try {
    const { post_id } = req.params;
    const { title, content, excerpt, thumbnail_url, status } = req.body;

    const update = {};
    if (title !== undefined) update.title = title;
    if (content !== undefined) update.content = content;
    if (excerpt !== undefined) update.excerpt = excerpt;
    if (thumbnail_url !== undefined) update.thumbnail_url = thumbnail_url;
    if (status !== undefined) {
      update.status = status;
      if (status === 'published') update.published_at = new Date();
    }

    const post = await BlogPost.findByIdAndUpdate(post_id, update, { new: true });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/blog/:post_id
const delete_post = async (req, res, next) => {
  try {
    const { post_id } = req.params;
    const post = await BlogPost.findByIdAndDelete(post_id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Sales ────────────────────────────────────────────────────────────────────

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
  get_campaigns,
  update_campaign,
  get_admin_posts,
  create_post,
  update_post,
  delete_post,
  analyze_sales,
};
