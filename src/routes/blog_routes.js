import { Router } from 'express';
import { get_published_posts, get_post_by_slug } from '../controllers/blog_controller.js';

const router = Router();

router.get('/', get_published_posts);
router.get('/:slug', get_post_by_slug);

export default router;
