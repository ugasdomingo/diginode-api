import Credential from '../models/credential_model.js';
import VaultAudit from '../models/vault_audit_model.js';
import Client from '../models/client_model.js';
import { assert_client_access } from '../agency/access.js';
import { decrypt_secret, encrypt_secret } from '../services/vault_crypto.js';
import http_error from '../utils/http_error.js';

const actor_fields = (actor) => ({
  actor_type: actor.type === 'bot' ? 'bot' : actor.role,
  actor_id: String(actor.id),
  actor_label: actor.label,
});

const audit = (fields) => VaultAudit.create(fields).catch(() => {});

const public_credential = (doc) => ({
  id: doc._id,
  client_id: doc.client_id,
  provider: doc.provider,
  label: doc.label,
  created_at: doc.created_at,
  updated_at: doc.updated_at,
});

const respond_vault_error = (res, err) => {
  if (err?.status_code === 503) {
    return res.status(503).json({ success: false, message: 'La caja fuerte no está configurada' });
  }
  throw err;
};

export const list_credentials = async (req, res) => {
  assert_client_access(req.actor, req.params.client_id);
  const docs = await Credential.find({ client_id: req.params.client_id }).sort({ created_at: -1 });
  res.json({ success: true, data: docs.map(public_credential) });
};

export const create_credential = async (req, res) => {
  assert_client_access(req.actor, req.params.client_id);
  if (!(await Client.exists({ _id: req.params.client_id }))) {
    throw http_error(404, 'Cliente no encontrado');
  }
  let encrypted;
  try {
    encrypted = encrypt_secret(JSON.stringify(req.body.secret));
  } catch (err) {
    return respond_vault_error(res, err);
  }
  const doc = await Credential.create({
    client_id: req.params.client_id,
    provider: req.body.provider || 'otro',
    label: req.body.label,
    created_by: req.actor.label,
    ...encrypted,
  });
  await audit({
    credential_id: doc._id,
    client_id: doc.client_id,
    action: 'create',
    ...actor_fields(req.actor),
  });
  res.status(201).json({ success: true, data: public_credential(doc) });
};

export const decrypt_credential = async (req, res) => {
  const doc = await Credential.findById(req.params.credential_id).select(
    '+ciphertext +iv +auth_tag'
  );
  if (!doc) throw http_error(404, 'Credencial no encontrada');
  assert_client_access(req.actor, doc.client_id);
  if (req.actor.type === 'user' && req.actor.role !== 'admin') {
    throw http_error(403, 'Acceso denegado');
  }

  try {
    const secret = JSON.parse(decrypt_secret(doc));
    await audit({
      credential_id: doc._id,
      client_id: doc.client_id,
      action: 'read',
      ...actor_fields(req.actor),
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: { id: doc._id, provider: doc.provider, label: doc.label, secret },
    });
  } catch (err) {
    await audit({
      credential_id: doc._id,
      client_id: doc.client_id,
      action: 'read_failed',
      ...actor_fields(req.actor),
    });
    if (err?.status_code === 503) return respond_vault_error(res, err);
    throw http_error(422, 'No se pudo descifrar');
  }
};

export const delete_credential = async (req, res) => {
  const doc = await Credential.findById(req.params.credential_id);
  if (!doc) throw http_error(404, 'Credencial no encontrada');
  assert_client_access(req.actor, doc.client_id);
  if (
    req.actor.type === 'user' &&
    req.actor.role === 'client' &&
    String(req.actor.client_id) !== String(doc.client_id)
  ) {
    throw http_error(403, 'Acceso denegado');
  }
  await Credential.deleteOne({ _id: doc._id });
  await audit({
    credential_id: doc._id,
    client_id: doc.client_id,
    action: 'delete',
    ...actor_fields(req.actor),
  });
  res.json({ success: true });
};

export const list_audit = async (req, res) => {
  const rows = await VaultAudit.find({ client_id: req.params.client_id })
    .sort({ at: -1 })
    .limit(100);
  res.json({ success: true, data: rows });
};
