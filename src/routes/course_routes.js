import { Router } from 'express';
import { get_courses, get_course_by_slug, join_waitlist, create_course_checkout } from '../controllers/course_controller.js';

const router = Router();

router.get('/', get_courses);
router.get('/:slug', get_course_by_slug);
router.post('/:slug/waitlist', join_waitlist);
router.post('/:slug/checkout', create_course_checkout);

export default router;
