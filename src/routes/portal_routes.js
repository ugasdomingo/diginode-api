import { Router } from 'express';
import { authenticate, require_role } from '../middleware/auth_middleware.js';
import {
  get_portal_invoices,
  get_portal_services,
  get_portal_tickets,
  create_support_ticket,
} from '../controllers/portal_controller.js';

const router = Router();

// All portal routes require a valid JWT with role === 'client'
router.use(authenticate, require_role('client'));

router.get('/invoices', get_portal_invoices);
router.get('/services', get_portal_services);
router.get('/tickets', get_portal_tickets);
router.post('/support', create_support_ticket);

export default router;
