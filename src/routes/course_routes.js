import { Router } from 'express';
import { get_courses, get_course_by_slug, join_waitlist } from '../controllers/course_controller.js';

const router = Router();

router.get('/', get_courses);
router.get('/:slug', get_course_by_slug);
router.post('/:slug/waitlist', join_waitlist);

export default router;
