import { Router } from 'express';
import { get_courses, get_course_by_slug, join_waitlist, create_course_checkout } from '../controllers/course_controller.js';
import validate from '../middleware/validate_middleware.js';
import { waitlist_schema } from '../schemas/course_schema.js';

const router = Router();

router.get('/', get_courses);
router.get('/:slug', get_course_by_slug);
router.post('/:slug/waitlist', validate(waitlist_schema), join_waitlist);
router.post('/:slug/checkout', create_course_checkout);

export default router;
