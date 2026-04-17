import Package from '../models/package_model.js';
import { create_package_checkout_session } from '../services/stripe_service.js';

// GET /api/packages
const get_packages = async (req, res, next) => {
  try {
    const packages = await Package.find({ active: true }).sort({ created_at: -1 });
    res.json({ success: true, data: packages });
  } catch (err) {
    next(err);
  }
};

// GET /api/packages/:slug
const get_package_by_slug = async (req, res, next) => {
  try {
    const pkg = await Package.findOne({ slug: req.params.slug });
    if (!pkg) return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    res.json({ success: true, data: pkg });
  } catch (err) {
    next(err);
  }
};

// POST /api/packages/:slug/checkout
// Creates a Stripe Checkout Session and returns the URL to redirect the user to.
const create_checkout = async (req, res, next) => {
  try {
    const { url, session_id } = await create_package_checkout_session({
      package_slug: req.params.slug,
    });

    res.json({ success: true, url, session_id });
  } catch (err) {
    next(err);
  }
};

export { get_packages, get_package_by_slug, create_checkout };
