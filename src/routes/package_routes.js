import { Router } from 'express';
import { get_packages, get_package_by_slug, create_checkout } from '../controllers/package_controller.js';

const router = Router();

// Public — no auth required
router.get('/',          get_packages);
router.get('/:slug',     get_package_by_slug);
router.post('/:slug/checkout', create_checkout);

export default router;
