import { randomBytes } from 'node:crypto';
import Client from '../models/client_model.js';
import User from '../models/user_model.js';
import Piece from '../models/piece_model.js';
import { assert_client_access, scoped_client_id } from '../agency/access.js';
import { present_client } from '../agency/present.js';
import { send_access_email } from '../services/agency_mailer.js';
import { clamp_pagination } from '../utils/pagination.js';
import http_error from '../utils/http_error.js';

const normalize_kpis = (kpis) =>
  kpis?.map((kpi) => ({
    name: kpi.name,
    value: kpi.value == null ? undefined : String(kpi.value),
    unit: kpi.unit,
    period: kpi.period,
    updated_at: new Date(),
  }));

export const list_clients = async (req, res) => {
  const filter = {};
  const scoped = scoped_client_id(req.actor, req.query.client_id);
  if (req.actor.role === 'client') filter._id = scoped;
  else if (scoped && typeof scoped === 'object') filter._id = scoped;
  else if (typeof scoped === 'string') filter._id = scoped;
  const { limit, skip } = clamp_pagination(req.query);
  const [clients, total] = await Promise.all([
    Client.find(filter).sort({ updated_at: -1 }).skip(skip).limit(limit),
    Client.countDocuments(filter),
  ]);
  res.json({ success: true, data: clients.map(present_client), total });
};

export const create_client = async (req, res) => {
  const body = req.body;
  try {
    const client = await Client.create({
      name: body.name,
      email: body.email,
      company: body.company,
      country: body.country,
      plan: body.plan || 'individual',
      status: body.status || 'pending',
      service_package: body.service_package,
      account_manager_bot: body.account_manager_bot,
      brand: body.brand,
      kpis: normalize_kpis(body.kpis) || [],
      strategy_links: body.strategy_links || [],
    });
    res.status(201).json({ success: true, data: present_client(client) });
  } catch (err) {
    if (err?.code === 11000) throw http_error(409, 'Ya existe un cliente con ese email');
    throw err;
  }
};

export const get_client = async (req, res) => {
  assert_client_access(req.actor, req.params.client_id);
  const client = await Client.findById(req.params.client_id);
  if (!client) throw http_error(404, 'Cliente no encontrado');
  res.json({ success: true, data: present_client(client) });
};

export const patch_client = async (req, res) => {
  assert_client_access(req.actor, req.params.client_id);
  const body = req.body;
  const update = {};
  for (const key of [
    'name',
    'company',
    'country',
    'status',
    'service_package',
    'account_manager_bot',
    'brand',
    'strategy_links',
  ]) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.kpis) update.kpis = normalize_kpis(body.kpis);
  const client = await Client.findByIdAndUpdate(req.params.client_id, update, {
    new: true,
    runValidators: true,
  });
  if (!client) throw http_error(404, 'Cliente no encontrado');
  res.json({ success: true, data: present_client(client) });
};

export const snapshot = async (req, res) => {
  assert_client_access(req.actor, req.params.client_id);
  const client = await Client.findById(req.params.client_id);
  if (!client) throw http_error(404, 'Cliente no encontrado');
  const pieces = await Piece.find({
    client_id: client._id,
    status: { $ne: 'archivado' },
  })
    .sort({ updated_at: -1 })
    .limit(50)
    .select('type title status drive_url version');

  res.json({
    success: true,
    data: {
      client: {
        id: client._id,
        name: client.name,
        company: client.company || null,
        email: client.email,
        status: client.status,
        plan: client.plan,
        service_package: client.service_package || null,
        account_manager_bot: client.account_manager_bot || null,
      },
      brand: {
        name: client.brand?.name || client.company || client.name,
        voice: client.brand?.voice || null,
        sector: client.brand?.sector || null,
        city: client.brand?.city || null,
        logo_url: client.brand?.logo_url || null,
      },
      strategy_links: (client.strategy_links || []).map((link) => ({
        label: link.label,
        url: link.url,
      })),
      active_pieces: pieces.map((piece) => ({
        id: piece._id,
        type: piece.type,
        title: piece.title || null,
        status: piece.status,
        drive_url: piece.drive_url || null,
        version: piece.version,
      })),
      kpis: (client.kpis || []).map((kpi) => ({
        name: kpi.name,
        value: kpi.value || null,
        unit: kpi.unit || null,
        period: kpi.period || null,
        updated_at: kpi.updated_at || null,
      })),
    },
  });
};

// Creates the portal user the client needs in order to pass 2FA and approve.
// The temporary password is returned once and also emailed. It is not logged.
export const portal_access = async (req, res) => {
  const client = await Client.findById(req.params.client_id);
  if (!client) throw http_error(404, 'Cliente no encontrado');

  const existing = await User.findOne({ email: client.email });
  if (existing) {
    if (existing.client_id && String(existing.client_id) !== String(client._id)) {
      throw http_error(409, 'Ese email ya pertenece a otra cuenta');
    }
    if (!existing.client_id) {
      existing.client_id = client._id;
      await existing.save();
    }
    return res.json({ success: true, data: { created: false, email: client.email } });
  }

  const temporary_password = randomBytes(12).toString('base64url');
  await User.create({
    email: client.email,
    password_hash: await User.hash_password(temporary_password),
    role: 'client',
    client_id: client._id,
    password_change_required: true,
  });

  let email_sent;
  try {
    await send_access_email(client.email, { name: client.name, temporary_password });
    email_sent = process.env.OTP_EMAIL_PROVIDER !== 'log';
  } catch {
    email_sent = false;
  }

  res.set('Cache-Control', 'no-store');
  res.status(201).json({
    success: true,
    data: { created: true, email: client.email, email_sent, temporary_password },
  });
};
