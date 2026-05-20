import Lead from '../models/lead_model.js';
import Client from '../models/client_model.js';
import Payment from '../models/payment_model.js';
import PackageSubscription from '../models/package_subscription_model.js';
import Knowledge from '../models/knowledge_model.js';
import SupportTicket from '../models/support_ticket_model.js';
import Campaign from '../models/campaign_model.js';
import BlogPost from '../models/blog_post_model.js';
import Course from '../models/course_model.js';
import CourseWaitlist from '../models/course_waitlist_model.js';
import Package from '../models/package_model.js';
import { analyze_meeting } from '../services/ingeniero_service.js';
import { convert_lead_to_client } from '../services/crm_service.js';
import { create_manual_checkout_session } from '../services/stripe_service.js';

// GET /api/admin/dashboard
const get_dashboard = async (_req, res, next) => {
  try {
    const [total_leads, total_clients, open_tickets, content_drafts, live_offices] = await Promise.all([
      Lead.countDocuments(),
      Client.countDocuments({ status: 'active' }),
      SupportTicket.countDocuments({ status: { $in: ['open', 'pending_review'] } }),
      Campaign.countDocuments({ status: 'pending' }),
      Client.countDocuments({ office_status: 'live' }),
    ]);

    res.json({
      success: true,
      data: { total_leads, total_clients, open_tickets, content_drafts, live_offices },
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

// GET /api/admin/courses
const get_admin_courses = async (_req, res, next) => {
  try {
    const courses = await Course.find().sort({ created_at: -1 });
    res.json({ success: true, data: courses });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/courses
const create_course = async (req, res, next) => {
  try {
    const { title, description, content, price, start_date, status, thumbnail_url, is_for_me, max_spots, spots_taken } = req.body;

    if (!title || price == null) {
      return res.status(400).json({ success: false, message: 'title y price son obligatorios' });
    }
    if (!is_for_me?.trim()) {
      return res.status(400).json({ success: false, message: 'El texto "¿Es para mí?" es obligatorio' });
    }

    const slug = slugify(title);
    const course = await Course.create({
      title, slug, description, content, price, start_date, status, thumbnail_url,
      is_for_me: is_for_me.trim(),
      max_spots:   max_spots   ?? null,
      spots_taken: spots_taken ?? 0,
    });
    res.status(201).json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/courses/:course_id
const update_course = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { title, description, content, price, start_date, status, thumbnail_url, is_for_me, max_spots, spots_taken } = req.body;

    const update = {};
    if (title        !== undefined) update.title         = title;
    if (description  !== undefined) update.description   = description;
    if (content      !== undefined) update.content       = content;
    if (price        !== undefined) update.price         = price;
    if (start_date   !== undefined) update.start_date    = start_date;
    if (status       !== undefined) update.status        = status;
    if (thumbnail_url !== undefined) update.thumbnail_url = thumbnail_url;
    if (is_for_me    !== undefined) update.is_for_me     = is_for_me.trim();
    if (max_spots    !== undefined) update.max_spots     = max_spots ?? null;
    if (spots_taken  !== undefined) update.spots_taken   = Math.max(0, spots_taken ?? 0);

    const course = await Course.findByIdAndUpdate(course_id, update, { new: true });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/courses/:course_id
const delete_course = async (req, res, next) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.course_id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/courses/:course_id/waitlist
const get_course_waitlist = async (req, res, next) => {
  try {
    const entries = await CourseWaitlist.find({ course: req.params.course_id }).sort({ created_at: -1 });
    res.json({ success: true, data: entries });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/knowledge/:key
const get_knowledge = async (req, res, next) => {
  try {
    const doc = await Knowledge.findOne({ key: req.params.key });
    res.json({ success: true, data: { key: req.params.key, content: doc?.content ?? '' } });
  } catch (err) {
    next(err);
  }
};

// ─── Packages Admin ───────────────────────────────────────────────────────────

// GET /api/admin/packages
const get_admin_packages = async (_req, res, next) => {
  try {
    const packages = await Package.find().sort({ created_at: -1 });
    res.json({ success: true, data: packages });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/packages
const create_package = async (req, res, next) => {
  try {
    const {
      name, slug, description,
      price_monthly, price_monthly_renewal, minimum_months,
      stripe_price_id, features, active,
    } = req.body;

    if (!name || price_monthly == null) {
      return res.status(400).json({ success: false, message: 'name y price_monthly son obligatorios' });
    }

    const final_slug = slug?.trim()
      ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      : slugify(name);

    const pkg = await Package.create({
      name, slug: final_slug, description,
      price_monthly, price_monthly_renewal, minimum_months,
      stripe_price_id, features, active,
    });

    res.status(201).json({ success: true, data: pkg });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ya existe un paquete con ese slug' });
    }
    next(err);
  }
};

// PATCH /api/admin/packages/:package_id
const update_package = async (req, res, next) => {
  try {
    const allowed = [
      'name', 'description', 'price_monthly', 'price_monthly_renewal',
      'minimum_months', 'stripe_price_id', 'stripe_price_id_renewal',
      'features', 'active',
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const pkg = await Package.findByIdAndUpdate(req.params.package_id, update, { new: true });
    if (!pkg) return res.status(404).json({ success: false, message: 'Paquete no encontrado' });

    res.json({ success: true, data: pkg });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/packages/:package_id
const delete_package = async (req, res, next) => {
  try {
    const pkg = await Package.findByIdAndDelete(req.params.package_id);
    if (!pkg) return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/knowledge/:key
const update_knowledge = async (req, res, next) => {
  try {
    const { content } = req.body;
    const doc = await Knowledge.findOneAndUpdate(
      { key: req.params.key },
      { content: content ?? '' },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

// ─── Clients Admin ────────────────────────────────────────────────────────────

// GET /api/admin/clients
const get_admin_clients = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, status, plan } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (plan)   filter.plan   = plan;
    const skip = (Number(page) - 1) * Number(limit);

    const [clients, total] = await Promise.all([
      Client.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
      Client.countDocuments(filter),
    ]);

    res.json({ success: true, data: clients, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/clients/:client_id
// Returns client detail with full purchase history and subscription
const get_admin_client_detail = async (req, res, next) => {
  try {
    const { client_id } = req.params;

    const [client, payments, subscription] = await Promise.all([
      Client.findById(client_id),
      Payment.find({ client_id }).sort({ created_at: -1 }),
      PackageSubscription.findOne({ client_id, status: { $ne: 'canceled' } }),
    ]);

    if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    res.json({ success: true, data: { client, payments, subscription } });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/clients/:client_id/office
// Updates only commercial metadata for the isolated office instance.
const update_client_office = async (req, res, next) => {
  try {
    const { client_id } = req.params;
    const allowed = ['office_url', 'office_status', 'office_plan', 'office_instance_id', 'office_deployed_at'];
    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key] === '' ? null : req.body[key];
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'No office fields provided' });
    }

    const client = await Client.findByIdAndUpdate(
      client_id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    res.json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/payment-links
// Generates a Stripe Checkout link to charge a client for anything (installments, extras, etc.)
const create_payment_link = async (req, res, next) => {
  try {
    const { client_id, label, amount, installment_number, installment_total } = req.body;

    if (!client_id || !label || amount == null) {
      return res.status(400).json({ success: false, message: 'client_id, label y amount son obligatorios' });
    }
    if (amount <= 0) {
      return res.status(400).json({ success: false, message: 'El importe debe ser mayor que 0' });
    }

    const client = await Client.findById(client_id);
    if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    const { url, session_id } = await create_manual_checkout_session({
      client_id,
      label,
      amount,
      installment_number: installment_number ?? null,
      installment_total:  installment_total  ?? null,
    });

    res.json({ success: true, url, session_id });
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
  get_admin_courses,
  create_course,
  update_course,
  delete_course,
  get_course_waitlist,
  get_knowledge,
  update_knowledge,
  get_admin_packages,
  create_package,
  update_package,
  delete_package,
  get_admin_clients,
  get_admin_client_detail,
  update_client_office,
  create_payment_link,
};
