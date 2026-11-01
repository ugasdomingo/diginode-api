import { Router } from 'express';
import { login, verify_otp, resend_otp, change_password, logout_all } from '../controllers/auth_controller.js';
import { authenticate } from '../middleware/auth_middleware.js';
import validate from '../middleware/validate_middleware.js';
import { auth_limiter, otp_limiter } from '../middleware/rate_limit.js';
import { login_schema, change_password_schema } from '../schemas/auth_schema.js';
import { otp_resend_schema, otp_verify_schema } from '../schemas/agency_schema.js';

const router = Router();

router.post('/login', auth_limiter, validate(login_schema), login);
router.post('/otp/verify', otp_limiter, validate(otp_verify_schema), verify_otp);
router.post('/otp/resend', otp_limiter, validate(otp_resend_schema), resend_otp);
router.post('/change-password', authenticate, validate(change_password_schema), change_password);
router.post('/logout-all', authenticate, logout_all);

export default router;
