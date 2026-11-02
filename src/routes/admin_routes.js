import { Router } from 'express';
import { authenticate, require_role } from '../middleware/auth_middleware.js';
import validate_object_id from '../middleware/validate_object_id.js';
import validate from '../middleware/validate_middleware.js';
import Proposal from '../models/proposal_model.js';
import { proposal_input_schema } from '../schemas/proposal_schema.js';
import { admin_view, create_proposal } from '../services/proposal_service.js';
import {
  get_conversations,
  get_conversation_detail,
  patch_conversation,
  send_human_reply,
  refresh_faqs,
} from '../controllers/conversations_controller.js';
import {
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
} from '../controllers/admin_controller.js';

const router = Router();

// All admin routes require a valid JWT with role === 'admin'
router.use(authenticate, require_role('admin'));

router.get('/dashboard', get_dashboard);
router.get('/analytics', get_analytics);
router.get('/trainings', get_admin_trainings);
router.delete('/trainings/enrollments/:enrollment_id', validate_object_id('enrollment_id'), delete_training_enrollment);
router.get('/funnel', get_funnel);

router.get('/leads', get_leads);
router.get('/leads/:lead_id/proposals', validate_object_id('lead_id'), async (req, res, next) => {
  try {
    const proposals = await Proposal.find({ lead_id: req.params.lead_id }).sort({ version: -1 });
    res.json({ success: true, data: proposals.map(admin_view) });
  } catch (err) {
    next(err);
  }
});
router.post(
  '/leads/:lead_id/proposals',
  validate_object_id('lead_id'),
  validate(proposal_input_schema),
  async (req, res, next) => {
    try {
      res.status(201).json({ success: true, data: await create_proposal(req.params.lead_id, req.body) });
    } catch (err) {
      next(err);
    }
  }
);
router.patch('/leads/:lead_id', validate_object_id('lead_id'), update_lead);
router.post('/leads/:lead_id/convert', validate_object_id('lead_id'), convert_lead);
router.delete('/leads/:lead_id', validate_object_id('lead_id'), delete_lead);

router.post('/content/generate', generate_content);
router.get('/content/campaigns', get_campaigns);
router.patch('/content/campaigns/:campaign_id', validate_object_id('campaign_id'), update_campaign);

router.get('/blog', get_admin_posts);
router.post('/blog', create_post);
router.patch('/blog/:post_id', validate_object_id('post_id'), update_post);
router.delete('/blog/:post_id', validate_object_id('post_id'), delete_post);

router.post('/sales/analyze', analyze_sales);

router.get('/knowledge/:key', get_knowledge);
router.put('/knowledge/:key', update_knowledge);

router.get('/clients',             get_admin_clients);
router.get('/clients/:client_id',  validate_object_id('client_id'), get_admin_client_detail);
router.patch('/clients/:client_id/office', validate_object_id('client_id'), update_client_office);
router.post('/payment-links',      create_payment_link);
router.get('/offices/health',      get_offices_health);

// ── Conversations (Instagram agent) ──────────────────────────────────────────
router.get('/conversations',                        get_conversations);
router.get('/conversations/:record_id',             get_conversation_detail);
router.patch('/conversations/:record_id',           patch_conversation);
router.post('/conversations/:record_id/reply',      send_human_reply);
router.post('/faqs/refresh',                        refresh_faqs);

export default router;
