import Lead from '../models/lead_model.js';
import Client from '../models/client_model.js';
import Payment from '../models/payment_model.js';
import PackageSubscription from '../models/package_subscription_model.js';
import Knowledge from '../models/knowledge_model.js';
import { get_summary } from '../services/analytics_service.js';
import TrainingEnrollment from '../models/training_enrollment_model.js';
import { TRAININGS } from '../config/trainings.js';
import SupportTicket from '../models/support_ticket_model.js';
import Campaign from '../models/campaign_model.js';
import BlogPost from '../models/blog_post_model.js';
import { analyze_meeting } from '../services/ingeniero_service.js';
import { convert_lead_to_client } from '../services/crm_service.js';
import { create_manual_checkout_session } from '../services/stripe_service.js';
import { clamp_pagination } from '../utils/pagination.js';
import { post_webhook } from '../utils/retry_fetch.js';

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

// GET /api/admin/funnel?period=week|month
// Aggregated funnel metrics for the F3 dashboard.
const get_funnel = async (req, res, next) => {
  try {
    const days  = req.query.period === 'month' ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { created_at: { $gte: since } };

    const [by_source, by_stage, total] = await Promise.all([
      Lead.aggregate([{ $match: match }, { $group: { _id: '$source',       count: { $sum: 1 } } }]),
      Lead.aggregate([{ $match: match }, { $group: { _id: '$funnel_stage', count: { $sum: 1 } } }]),
      Lead.countDocuments(match),
    ]);

    const stage  = Object.fromEntries(by_stage.map(s => [s._id ?? 'unknown', s.count]));
    const source = Object.fromEntries(by_source.map(s => [s._id ?? 'unknown', s.count]));

    // Demos started = every lead that entered the funnel in the period.
    // Identified+ = gave name/business (identified, followup or won).
    const demos_started   = total;
    const identified      = (stage.identified ?? 0) + (stage.followup ?? 0) + (stage.won ?? 0);
    const won             = stage.won ?? 0;
    const lost            = stage.lost ?? 0;
    const identified_rate = demos_started ? Math.round((identified / demos_started) * 100) : 0;

    res.json({
      success: true,
      data: {
        period: days === 30 ? 'month' : 'week',
        demos_started, identified, won, lost, identified_rate,
        by_source: source,
        by_stage:  stage,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/leads
const get_leads = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const { page, limit, skip } = clamp_pagination(req.query);

    const [leads, total] = await Promise.all([
      Lead.find(filter).select('-chat_history').sort({ created_at: -1 }).skip(skip).limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.json({ success: true, data: leads, total, page });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/leads/:lead_id
const update_lead = async (req, res, next) => {
  try {
    const { lead_id } = req.params;
    const { status, funnel_stage } = req.body;

    const allowed_statuses = ['new', 'in_conversation', 'qualified', 'meeting_booked', 'won', 'lost'];
    const allowed_stages   = ['demo_started', 'identified', 'followup', 'won', 'lost'];

    const update = {};
    if (status !== undefined) {
      if (!allowed_statuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      update.status = status;
    }
    if (funnel_stage !== undefined) {
      if (!allowed_stages.includes(funnel_stage)) {
        return res.status(400).json({ success: false, message: 'Invalid funnel_stage' });
      }
      update.funnel_stage = funnel_stage;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'Nada que actualizar' });
    }

    const lead = await Lead.findByIdAndUpdate(lead_id, update, { new: true }).select('-chat_history');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/leads/:lead_id
// Para limpiar leads de prueba o basura. Borra también su historial de chat,
// que es dato personal del visitante: no tiene sentido conservarlo.
const delete_lead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.lead_id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    }
    res.json({ success: true });
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

    // Trigger Make.com scenario without blocking the response. Retries + dead-letter (F6-5).
    post_webhook(
      process.env.MAKE_CONTENT_WEBHOOK_URL,
      { campaign_id: campaign._id.toString(), name, context },
      { label: 'make_content' }
    );

    res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/content/campaigns
const get_campaigns = async (req, res, next) => {
  try {
    const { page, limit, skip } = clamp_pagination(req.query);

    const [campaigns, total] = await Promise.all([
      Campaign.find().sort({ created_at: -1 }).skip(skip).limit(limit),
      Campaign.countDocuments(),
    ]);

    res.json({ success: true, data: campaigns, total, page });
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
    const { page, limit, skip } = clamp_pagination(req.query);

    const [posts, total] = await Promise.all([
      BlogPost.find().sort({ created_at: -1 }).skip(skip).limit(limit),
      BlogPost.countDocuments(),
    ]);

    res.json({ success: true, data: posts, total, page });
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

// GET /api/admin/knowledge/:key
const get_knowledge = async (req, res, next) => {
  try {
    const doc = await Knowledge.findOne({ key: req.params.key });
    res.json({ success: true, data: { key: req.params.key, content: doc?.content ?? '' } });
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
    const { status, plan } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (plan)   filter.plan   = plan;
    const { page, limit, skip } = clamp_pagination(req.query, { default_limit: 30 });

    const [clients, total] = await Promise.all([
      Client.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
      Client.countDocuments(filter),
    ]);

    res.json({ success: true, data: clients, total, page });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/clients/:client_id
// Returns client detail with full purchase history and subscription
const get_admin_client_detail = async (req, res, next) => {
  try {
    const { client_id } = req.params;

    const [client, payments, subscription, has_token] = await Promise.all([
      Client.findById(client_id),
      Payment.find({ client_id }).sort({ created_at: -1 }),
      PackageSubscription.findOne({ client_id, status: { $ne: 'canceled' } }),
      Client.exists({ _id: client_id, office_admin_token: { $exists: true, $ne: null } }),
    ]);

    if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    // Never expose the office admin token; surface only whether one is set (F5-4).
    const client_obj = client.toObject();
    delete client_obj.office_admin_token;
    client_obj.office_admin_token_set = Boolean(has_token);

    res.json({ success: true, data: { client: client_obj, payments, subscription } });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/clients/:client_id/office
// Updates only commercial metadata for the isolated office instance.
const update_client_office = async (req, res, next) => {
  try {
    const { client_id } = req.params;
    const allowed = ['office_url', 'office_status', 'office_plan', 'office_instance_id', 'office_deployed_at', 'office_admin_token'];
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

    const client_obj = client.toObject();
    delete client_obj.office_admin_token;

    res.json({ success: true, data: client_obj });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/offices/health ─────────────────────────────────────────
// Fans out to each live office instance and aggregates their health snapshot.
// 30s memory cache so the admin can refresh aggressively without hammering offices.
const HEALTH_CACHE_TTL_MS = Number(process.env.OFFICES_HEALTH_CACHE_TTL_MS ?? 30_000);
const HEALTH_FETCH_TIMEOUT_MS = Number(process.env.OFFICES_HEALTH_TIMEOUT_MS ?? 5000);
let healthCache = { fetchedAt: 0, payload: null };

const fetch_office_snapshot = async ({ url, token }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/health/snapshot`, {
      method: 'GET',
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return { ok: false, status: response.status };
    const json = await response.json().catch(() => null);
    return { ok: true, data: json?.data ?? null };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
};

const get_offices_health = async (req, res, next) => {
  try {
    if (req.query.force !== '1' && healthCache.payload && Date.now() - healthCache.fetchedAt < HEALTH_CACHE_TTL_MS) {
      return res.json({ success: true, data: healthCache.payload, cachedAt: new Date(healthCache.fetchedAt).toISOString() });
    }

    const clients = await Client.find({ office_url: { $exists: true, $nin: [null, ''] } })
      .select('+office_admin_token name email office_url office_status office_plan office_instance_id office_deployed_at onboarding_status');

    const results = await Promise.all(clients.map(async (client) => {
      const base = {
        clientId: client._id,
        clientName: client.name,
        clientEmail: client.email,
        officeUrl: client.office_url,
        officeStatus: client.office_status,
        officePlan: client.office_plan,
        officeInstanceId: client.office_instance_id,
        onboardingStatus: client.onboarding_status,
      };
      if (!client.office_admin_token) {
        return { ...base, health: null, reachable: false, error: 'admin_token_missing' };
      }
      const snap = await fetch_office_snapshot({ url: client.office_url, token: client.office_admin_token });
      if (!snap.ok) return { ...base, health: null, reachable: false, error: snap.error ?? `http_${snap.status}` };
      return { ...base, reachable: true, health: snap.data };
    }));

    healthCache = { fetchedAt: Date.now(), payload: results };
    res.json({ success: true, data: results, cachedAt: new Date(healthCache.fetchedAt).toISOString() });
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

// ─── GET /api/admin/analytics ──────────────────────────────────────────────
// Resumen de tráfico de la web pública. Datos agregados y anónimos: no hay
// forma de saber quién fue nadie, por diseño (ver models/pageview_model.js).
const get_analytics = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
    const data = await get_summary({ days });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/admin/trainings/enrollments/:enrollment_id ────────────────
// Libera una plaza: borra la inscripción y el registro de compra asociado, para
// que no quede una compra huérfana en el panel del alumno.
//
// La cuenta del alumno NO se borra: puede tener otras cosas colgando y no es
// decisión de esta pantalla. Si hay que eliminarla, se hace desde Clientes.
const delete_training_enrollment = async (req, res, next) => {
  try {
    const enrollment = await TrainingEnrollment.findByIdAndDelete(req.params.enrollment_id);

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Inscripción no encontrada' });
    }

    await Payment.deleteOne(
      enrollment.stripe_session_id
        ? { stripe_session_id: enrollment.stripe_session_id }
        : { client_id: enrollment.client_id, reference_slug: enrollment.training_slug, amount: 0 }
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/trainings ──────────────────────────────────────────────
// Formaciones del catálogo con su aforo, su recaudación y la lista de inscritos.
// Es la pantalla desde la que se envía el enlace de la sesión y se controla si
// hay que abrir otra convocatoria.
const get_admin_trainings = async (req, res, next) => {
  try {
    const catalogo = Object.values(TRAININGS);

    const trainings = await Promise.all(
      catalogo.map(async (t) => {
        const enrollments = await TrainingEnrollment.find({ training_slug: t.slug })
          .sort({ created_at: -1 })
          .lean();

        const pagadas = enrollments.filter((e) => e.status === 'paid');

        return {
          slug:        t.slug,
          name:        t.name,
          date:        t.date,
          time:        t.time,
          duration:    t.duration,
          platform:    t.platform,
          meet_url:    t.meet_url ?? null,
          price:       t.price,
          currency:    t.currency,
          capacity:    t.capacity,
          status:      t.status,
          seats_taken: pagadas.length,
          seats_left:  Math.max(t.capacity - pagadas.length, 0),
          revenue:     pagadas.reduce((sum, e) => sum + (e.amount ?? 0), 0),
          enrollments: enrollments.map((e) => ({
            id:         e._id,
            name:       e.name ?? null,
            email:      e.email,
            amount:     e.amount,
            currency:   e.currency,
            status:     e.status,
            overbooked: e.overbooked ?? false,
            // Si nunca canjeó el acceso automático, puede que no haya entrado
            // al panel: conviene comprobar que le llegó el correo.
            claimed:    !!e.claimed_at,
            created_at: e.created_at,
            client_id:  e.client_id ?? null,
          })),
        };
      })
    );

    res.json({ success: true, data: trainings });
  } catch (err) {
    next(err);
  }
};

export {
  get_dashboard,
  get_funnel,
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
  get_knowledge,
  update_knowledge,
  get_admin_clients,
  get_admin_client_detail,
  update_client_office,
  create_payment_link,
  get_offices_health,
  get_analytics,
  get_admin_trainings,
  delete_training_enrollment,
  delete_lead,
};
