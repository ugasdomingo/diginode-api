import Stripe from 'stripe';
import Course from '../models/course_model.js';
import CourseWaitlist from '../models/course_waitlist_model.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// GET /api/courses
const get_courses = async (req, res, next) => {
  try {
    const courses = await Course.find().select('-content').sort({ created_at: -1 });
    res.json({ success: true, data: courses });
  } catch (err) {
    next(err);
  }
};

// GET /api/courses/:slug
const get_course_by_slug = async (req, res, next) => {
  try {
    const course = await Course.findOne({ slug: req.params.slug });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

// POST /api/courses/:slug/waitlist
const join_waitlist = async (req, res, next) => {
  try {
    const course = await Course.findOne({ slug: req.params.slug, active: false });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado o ya disponible' });
    }

    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, message: 'name, email y phone son obligatorios' });
    }

    await CourseWaitlist.create({ course: course._id, name, email, phone });
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ya estás en la lista de espera de este curso' });
    }
    next(err);
  }
};

// POST /api/courses/:slug/checkout
const create_course_checkout = async (req, res, next) => {
  try {
    const course = await Course.findOne({ slug: req.params.slug, active: true });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado o no disponible' });
    }

    const base = process.env.FRONTEND_URL;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(course.price * 100),
            product_data: { name: course.title },
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/cursos/${course.slug}?pago=ok`,
      cancel_url:  `${base}/cursos/${course.slug}`,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    next(err);
  }
};

export { get_courses, get_course_by_slug, join_waitlist, create_course_checkout };
