import { Router } from 'express';
import { login, change_password } from '../controllers/auth_controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import validate from '../middleware/validate_middleware.js';
import { login_schema, change_password_schema } from '../schemas/auth_schema.js';

const router = Router();

router.post('/login', validate(login_schema), login);
router.post('/change-password', authenticate, validate(change_password_schema), change_password);

export default router;
