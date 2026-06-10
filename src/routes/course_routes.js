import { Router } from 'express';
import { get_courses, get_course_by_slug, join_waitlist, create_course_checkout } from '../controllers/course_controller.js';
import validate from '../middleware/validate_middleware.js';
import { form_limiter } from '../middleware/rate_limit.js';
import { waitlist_schema } from '../schemas/course_schema.js';

const router = Router();

router.get('/', get_courses);
router.get('/:slug', get_course_by_slug);
router.post('/:slug/waitlist', form_limiter, validate(waitlist_schema), join_waitlist);
router.post('/:slug/checkout', form_limiter, create_course_checkout);

export default router;
