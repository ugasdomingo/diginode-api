import { randomBytes } from 'node:crypto';
import Proposal from '../models/proposal_model.js';
import Lead from '../models/lead_model.js';
import { send_proposal_email } from './email_service.js';

const cents = (net, vat_rate) => Math.round(net * (1 + vat_rate / 100) * 100);
const error = (message, status_code) => Object.assign(new Error(message), { status_code });

export const proposal_url = (proposal) => `${process.env.FRONTEND_URL}/propuesta/${proposal.token}`;

// Gross amounts in cents: the same numbers drive the public page, Stripe and the webhook check.
export function amounts(proposal) {
  if (proposal.billing === 'subscription')
    return {
      first: cents(proposal.monthly + (proposal.setup || 0), proposal.vat_rate),
      monthly: cents(proposal.monthly, proposal.vat_rate),
      setup: cents(proposal.setup || 0, proposal.vat_rate),
    };
  return {
    first: cents(proposal.due_now, proposal.vat_rate),
    total: cents(proposal.total, proposal.vat_rate),
  };
}

export function public_view(proposal) {
  const expired = proposal.status === 'sent' && proposal.valid_until < new Date();
  return {
    version: proposal.version,
    status: expired ? 'expired' : proposal.status,
    service: proposal.service,
    billing: proposal.billing,
    currency: proposal.currency,
    vat_rate: proposal.vat_rate,
    items: proposal.items,
    monthly: proposal.monthly,
    setup: proposal.setup,
    total: proposal.total,
    due_now: proposal.due_now,
    amounts: amounts(proposal),
    message: proposal.message,
    valid_until: proposal.valid_until,
    company: proposal.company,
    contact_name: proposal.contact_name,
    paid_at: proposal.paid_at,
  };
}

export const admin_view = (proposal) => ({
  ...public_view(proposal),
  id: proposal._id,
  url: proposal_url(proposal),
  created_at: proposal.created_at,
});

export async function create_proposal(lead_id, input) {
  const lead = await Lead.findById(lead_id);
  if (!lead) throw error('Solicitud no encontrada', 404);
  if (!lead.email) throw error('La solicitud no tiene email', 400);
  const previous = await Proposal.findOne({ lead_id }).sort({ version: -1 });
  if (await Proposal.exists({ lead_id, status: 'paid' }))
    throw error('Esta solicitud ya tiene una propuesta pagada', 409);
  const subscription = input.service === 'brand_management';
  const proposal = await Proposal.create({
    lead_id,
    token: randomBytes(24).toString('base64url'),
    version: (previous?.version ?? 0) + 1,
    service: input.service,
    billing: subscription ? 'subscription' : 'one_time',
    currency: input.currency,
    vat_rate: input.vat_rate,
    items: input.items,
    monthly: subscription ? input.monthly : undefined,
    setup: subscription ? input.setup : undefined,
    total: subscription ? undefined : input.total,
    due_now: subscription ? undefined : (input.due_now ?? input.total),
    message: input.message,
    valid_until: new Date(Date.now() + input.valid_days * 86400000),
    company: lead.company,
    contact_name: lead.name,
    email: lead.email,
  });
  await Proposal.updateMany(
    { lead_id, _id: { $ne: proposal._id }, status: 'sent' },
    { $set: { status: 'superseded' } }
  );
  await Lead.updateOne({ _id: lead_id }, { $set: { funnel_stage: 'proposal', status: 'qualified' } });
  let emailed = false;
  if (input.send_email) {
    try {
      await send_proposal_email(lead.email, {
        name: lead.name,
        url: proposal_url(proposal),
        version: proposal.version,
      });
      emailed = true;
    } catch {
      /* the proposal exists; the owner can copy the link instead */
    }
  }
  return { proposal: admin_view(proposal), emailed };
}

export async function payable_proposal(token) {
  const proposal =
    typeof token === 'string' && token.length < 80 ? await Proposal.findOne({ token }) : null;
  if (!proposal) throw error('Propuesta no encontrada', 404);
  const status = public_view(proposal).status;
  if (status === 'paid') throw error('Esta propuesta ya está pagada.', 409);
  if (status === 'expired')
    throw error('Esta propuesta ha caducado. Escríbenos y te enviamos una actualizada.', 409);
  if (status !== 'sent')
    throw error('Hay una versión más reciente. Usa el último enlace que te enviamos.', 409);
  return proposal;
}
