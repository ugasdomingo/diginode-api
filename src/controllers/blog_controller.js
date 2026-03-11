import BlogPost from '../models/blog_post_model.js';

// GET /api/blog
const get_published_posts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [posts, total] = await Promise.all([
      BlogPost.find({ status: 'published' })
        .select('-content')
        .sort({ published_at: -1 })
        .skip(skip)
        .limit(Number(limit)),
      BlogPost.countDocuments({ status: 'published' }),
    ]);

    res.json({ success: true, data: posts, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

// GET /api/blog/:slug
const get_post_by_slug = async (req, res, next) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

export { get_published_posts, get_post_by_slug };
