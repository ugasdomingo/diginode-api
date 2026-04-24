import { Router } from 'express';
import { login, change_password } from '../controllers/auth_controller.js';
import { authenticate } from '../middleware/auth_middleware.js';

const router = Router();

router.post('/login', login);
router.post('/change-password', authenticate, change_password);

export default router;
