import { Router } from 'express';
import { authenticate, require_role } from '../middleware/auth_middleware.js';
import {
  get_dashboard,
  get_leads,
  update_lead,
  convert_lead,
  generate_content,
  design_content,
  get_content,
  update_content,
  analyze_sales,
} from '../controllers/admin_controller.js';

const router = Router();

// All admin routes require a valid JWT with role === 'admin'
router.use(authenticate, require_role('admin'));

router.get('/dashboard', get_dashboard);

router.get('/leads', get_leads);
router.patch('/leads/:lead_id', update_lead);
router.post('/leads/:lead_id/convert', convert_lead);

router.get('/content', get_content);
router.post('/content/generate', generate_content);
router.post('/content/:content_id/design', design_content);
router.patch('/content/:content_id', update_content);

router.post('/sales/analyze', analyze_sales);

export default router;
