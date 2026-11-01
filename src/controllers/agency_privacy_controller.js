import { randomBytes } from 'node:crypto';
import Lead from '../models/lead_model.js';
import Client from '../models/client_model.js';
import User from '../models/user_model.js';
import Credential from '../models/credential_model.js';
import VaultAudit from '../models/vault_audit_model.js';
import Payment from '../models/payment_model.js';
import Meeting from '../models/meeting_model.js';
import http_error from '../utils/http_error.js';

const lead_personal = (lead) => ({
  id: lead._id,
  business: lead.company || null,
  name: lead.name || null,
  email: lead.email || null,
  phone: lead.phone || null,
  country: lead.country || null,
  website: lead.website || null,
  links: lead.links || [],
  contact_id: lead.contact_id,
  platform: lead.platform,
  source: lead.source,
  origin_detail: lead.origin_detail || null,
  internal_notes: lead.internal_notes || null,
  chat_history: lead.chat_history || [],
  activity: lead.activity || [],
  next_action: lead.next_action || null,
  created_at: lead.created_at,
  erased_at: lead.erased_at || null,
});

export const export_lead = async (req, res) => {
  const lead = await Lead.findById(req.params.lead_id);
  if (!lead) throw http_error(404, 'Lead no encontrado');
  res.set('Cache-Control', 'no-store');
  res.set('Content-Disposition', `attachment; filename="lead-${lead._id}.json"`);
  res.json({ success: true, data: lead_personal(lead) });
};

const erase_lead_record = async (lead) => {
  if (lead.erased_at) return { erased: true, already: true };
  await Lead.findByIdAndUpdate(lead._id, {
    $set: {
      contact_id: `erased_${lead._id}`,
      erased_at: new Date(),
      links: [],
      chat_history: [],
      activity: [],
    },
    $unset: {
      name: '',
      email: '',
      phone: '',
      country: '',
      company: '',
      website: '',
      internal_notes: '',
      origin_detail: '',
      next_action: '',
      next_action_at: '',
    },
  });
  return { erased: true };
};

export const erase_lead = async (req, res) => {
  const lead = await Lead.findById(req.params.lead_id);
  if (!lead) throw http_error(404, 'Lead no encontrado');
  res.json({ success: true, data: await erase_lead_record(lead) });
};

export const export_client = async (req, res) => {
  const client = await Client.findById(req.params.client_id);
  if (!client) throw http_error(404, 'Cliente no encontrado');
  const [users, credentials, meetings, payments] = await Promise.all([
    User.find({ client_id: client._id }).select('email role is_active created_at'),
    Credential.find({ client_id: client._id }).select('provider label created_at'),
    Meeting.find({ client_id: client._id }).select('title starts_at location notes status'),
    Payment.find({ client_id: client._id }).select(
      'amount currency description created_at payer_email payer_name'
    ),
  ]);
  res.set('Cache-Control', 'no-store');
  res.set('Content-Disposition', `attachment; filename="cliente-${client._id}.json"`);
  res.json({
    success: true,
    data: {
      id: client._id,
      name: client.name,
      email: client.email,
      company: client.company || null,
      country: client.country || null,
      brand: client.brand || null,
      users: users.map((user) => ({
        email: user.email,
        role: user.role,
        is_active: user.is_active,
      })),
      // Labels only. Secrets stay encrypted and are removed on erasure, not copied here.
      credentials: credentials.map((item) => ({
        provider: item.provider,
        label: item.label,
        created_at: item.created_at,
      })),
      meetings,
      payments,
    },
  });
};

export const erase_client = async (req, res) => {
  const client = await Client.findById(req.params.client_id);
  if (!client) throw http_error(404, 'Cliente no encontrado');

  const credentials = await Credential.find({ client_id: client._id });
  if (credentials.length) {
    await VaultAudit.insertMany(
      credentials.map((item) => ({
        credential_id: item._id,
        client_id: client._id,
        actor_type: 'admin',
        actor_id: String(req.actor.id),
        actor_label: req.actor.label,
        action: 'delete',
        at: new Date(),
      }))
    );
    await Credential.deleteMany({ client_id: client._id });
  }

  const users = await User.find({ client_id: client._id });
  for (const user of users) {
    user.email = `erased+${user._id}@invalid.local`;
    user.is_active = false;
    user.password_hash = await User.hash_password(randomBytes(24).toString('hex'));
    user.token_version = (user.token_version ?? 0) + 1;
    await user.save();
  }

  await Payment.updateMany(
    { client_id: client._id },
    { $unset: { payer_email: '', payer_name: '' } }
  );
  await Meeting.updateMany({ client_id: client._id }, { $unset: { notes: '', location: '' } });

  if (client.lead_id) {
    const lead = await Lead.findById(client.lead_id);
    if (lead) await erase_lead_record(lead);
  }

  const erased_email = `erased+${client._id}@invalid.local`;
  await Client.findByIdAndUpdate(client._id, {
    $set: {
      name: 'Cliente eliminado',
      email: erased_email,
      status: 'cancelled',
      kpis: [],
      strategy_links: [],
      telegram_chat_ids: {},
    },
    $unset: {
      company: '',
      country: '',
      brand: '',
      onboarding_form: '',
      service_package: '',
      account_manager_bot: '',
    },
  });

  res.json({
    success: true,
    data: {
      erased: true,
      retained:
        'Importes de facturas y pagos (obligación contable), sin email ni nombre del pagador.',
    },
  });
};
