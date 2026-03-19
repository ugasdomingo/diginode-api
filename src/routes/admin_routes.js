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
  get_admin_courses,
  create_course,
  update_course,
  delete_course,
  get_course_waitlist,
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

router.get('/courses', get_admin_courses);
router.post('/courses', create_course);
router.patch('/courses/:course_id', update_course);
router.delete('/courses/:course_id', delete_course);
router.get('/courses/:course_id/waitlist', get_course_waitlist);

export default router;
