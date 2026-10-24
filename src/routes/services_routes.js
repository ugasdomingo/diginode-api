import { Router } from 'express';
import { SERVICES, PRIVACY_VERSION, booking_link } from '../config/services.js';
const router = Router();
router.get('/', (_req, res) =>
  res.json({
    success: true,
    data: { services: SERVICES, privacy_version: PRIVACY_VERSION, booking_url: booking_link() },
  })
);
export default router;
