import { Router } from 'express';
import { authenticate, require_role } from '../middleware/auth_middleware.js';
import {
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
} from '../controllers/admin_controller.js';

const router = Router();

// All admin routes require a valid JWT with role === 'admin'
router.use(authenticate, require_role('admin'));

router.get('/dashboard', get_dashboard);

router.get('/leads', get_leads);
router.patch('/leads/:lead_id', update_lead);
router.post('/leads/:lead_id/convert', convert_lead);

router.post('/content/generate', generate_content);
router.get('/content/campaigns', get_campaigns);
router.patch('/content/campaigns/:campaign_id', update_campaign);

router.get('/blog', get_admin_posts);
router.post('/blog', create_post);
router.patch('/blog/:post_id', update_post);
router.delete('/blog/:post_id', delete_post);

router.post('/sales/analyze', analyze_sales);

export default router;
