import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import Proposal from '../models/proposal_model.js';
import { payable_proposal, public_view } from '../services/proposal_service.js';
import { create_proposal_checkout_session } from '../services/stripe_service.js';

const router = Router();
router.get('/:token', async (req, res, next) => {
  try {
    const proposal =
      req.params.token.length < 80 ? await Proposal.findOne({ token: req.params.token }) : null;
    if (!proposal)
      return res.status(404).json({ success: false, message: 'Propuesta no encontrada' });
    res.json({ success: true, data: public_view(proposal) });
  } catch (err) {
    next(err);
  }
});
router.post(
  '/:token/checkout',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }),
  async (req, res, next) => {
    try {
      const proposal = await payable_proposal(req.params.token);
      res.json({ success: true, ...(await create_proposal_checkout_session(proposal)) });
    } catch (err) {
      next(err);
    }
  }
);
export default router;
