import ApiKey from '../models/api_key_model.js';
import { generate_api_key } from '../services/api_key_service.js';
import http_error from '../utils/http_error.js';

const present_key = (key) => ({
  id: key._id,
  name: key.name,
  prefix: key.prefix,
  scopes: key.scopes,
  client_ids: key.client_ids,
  revoked_at: key.revoked_at || null,
  last_used_at: key.last_used_at || null,
  created_at: key.created_at,
});

export const list_keys = async (_req, res) => {
  const keys = await ApiKey.find().sort({ created_at: -1 });
  res.json({ success: true, data: keys.map(present_key) });
};

export const create_key = async (req, res) => {
  const generated = generate_api_key();
  const key = await ApiKey.create({
    name: req.body.name,
    prefix: generated.prefix,
    key_hash: generated.key_hash,
    scopes: req.body.scopes,
    client_ids: req.body.client_ids || [],
    created_by: req.actor.id,
  });
  res.set('Cache-Control', 'no-store');
  res.status(201).json({
    success: true,
    data: { ...present_key(key), key: generated.key },
  });
};

export const patch_key = async (req, res) => {
  const key = await ApiKey.findById(req.params.key_id);
  if (!key || key.revoked_at) throw http_error(404, 'Clave no encontrada');
  if (req.body.name) key.name = req.body.name;
  if (req.body.scopes) key.scopes = req.body.scopes;
  if (req.body.client_ids) key.client_ids = req.body.client_ids;
  await key.save();
  res.json({ success: true, data: present_key(key) });
};

export const revoke_key = async (req, res) => {
  const key = await ApiKey.findById(req.params.key_id);
  if (!key) throw http_error(404, 'Clave no encontrada');
  if (!key.revoked_at) {
    key.revoked_at = new Date();
    await key.save();
  }
  res.json({ success: true, data: present_key(key) });
};
