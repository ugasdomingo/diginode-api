import { Router } from 'express';
import { login, change_password, logout_all } from '../controllers/auth_controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import validate from '../middleware/validate_middleware.js';
import { auth_limiter } from '../middleware/rate_limit.js';
import { login_schema, change_password_schema } from '../schemas/auth_schema.js';

const router = Router();

router.post('/login', auth_limiter, validate(login_schema), login);
router.post('/change-password', authenticate, validate(change_password_schema), change_password);
router.post('/logout-all', authenticate, logout_all);

export default router;
