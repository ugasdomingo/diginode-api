import Piece from '../models/piece_model.js';
import Approval from '../models/approval_model.js';
import Client from '../models/client_model.js';
import Lead from '../models/lead_model.js';
import {
  assert_client_access,
  assert_prospect_access,
  scoped_client_id,
} from '../agency/access.js';
import { decide_cliente, decide_domingo, submit_piece } from '../services/approval_service.js';
import { clamp_pagination } from '../utils/pagination.js';
import http_error from '../utils/http_error.js';

const assert_piece_visible = async (actor, piece) => {
  if (!piece) throw http_error(404, 'Pieza no encontrada');
  if (piece.client_id) assert_client_access(actor, piece.client_id);
  else if (actor.type === 'user' && actor.role === 'client')
    throw http_error(403, 'Acceso denegado');
  else if (actor.type === 'bot' && actor.client_ids?.length)
    throw http_error(403, 'Acceso denegado');
  return piece;
};

export const list_pieces = async (req, res) => {
  const filter = {};
  const client_id = scoped_client_id(req.actor, req.query.client_id);
  if (client_id) filter.client_id = client_id;
  if (typeof req.query.lead_id === 'string') filter.lead_id = req.query.lead_id;
  if (typeof req.query.status === 'string') filter.status = req.query.status.slice(0, 40);
  if (typeof req.query.author_bot === 'string')
    filter.author_bot = req.query.author_bot.slice(0, 80);
  const { limit, skip } = clamp_pagination(req.query);
  const [pieces, total] = await Promise.all([
    Piece.find(filter).sort({ updated_at: -1 }).skip(skip).limit(limit),
    Piece.countDocuments(filter),
  ]);
  res.json({ success: true, data: pieces, total });
};

export const create_piece = async (req, res) => {
  const body = req.body;
  if (body.client_id) {
    assert_client_access(req.actor, body.client_id);
    if (!(await Client.exists({ _id: body.client_id })))
      throw http_error(404, 'Cliente no encontrado');
  } else {
    assert_prospect_access(req.actor);
  }
  if (body.lead_id && !(await Lead.exists({ _id: body.lead_id, erased_at: null }))) {
    throw http_error(404, 'Lead no encontrado');
  }
  const author_bot = body.author_bot || (req.actor.type === 'bot' ? req.actor.name : undefined);
  const piece = await Piece.create({
    client_id: body.client_id,
    lead_id: body.lead_id,
    type: body.type || 'otro',
    title: body.title,
    drive_url: body.drive_url,
    author_bot,
    version: 1,
    versions: [
      {
        version: 1,
        drive_url: body.drive_url,
        note: body.note,
        created_by: req.actor.label,
      },
    ],
  });
  res.status(201).json({ success: true, data: piece });
};

export const get_piece = async (req, res) => {
  const piece = await assert_piece_visible(req.actor, await Piece.findById(req.params.piece_id));
  res.json({ success: true, data: piece });
};

export const patch_piece = async (req, res) => {
  const piece = await assert_piece_visible(req.actor, await Piece.findById(req.params.piece_id));
  const body = req.body;
  if (body.drive_url && piece.status !== 'borrador') {
    throw http_error(
      409,
      'El enlace solo se cambia en borrador. Añade una versión cuando vuelva al autor.'
    );
  }
  if (body.status === 'publicado') {
    const approval = await Approval.findOne({ piece_id: piece._id });
    if (!approval || approval.status !== 'aprobado') {
      throw http_error(409, 'La pieza no está aprobada');
    }
  }
  Object.assign(piece, body);
  await piece.save();
  res.json({ success: true, data: piece });
};

export const add_version = async (req, res) => {
  const piece = await assert_piece_visible(req.actor, await Piece.findById(req.params.piece_id));
  if (piece.status !== 'borrador') {
    throw http_error(409, 'Solo se versiona una pieza en borrador');
  }
  const version = (piece.version || 1) + 1;
  piece.version = version;
  if (req.body.drive_url) piece.drive_url = req.body.drive_url;
  piece.versions.push({
    version,
    drive_url: req.body.drive_url || piece.drive_url,
    note: req.body.note,
    created_by: req.actor.label,
  });
  await piece.save();
  res.json({ success: true, data: piece });
};

export const submit = async (req, res) => {
  const piece = await assert_piece_visible(req.actor, await Piece.findById(req.params.piece_id));
  const approval = await submit_piece(piece, req.actor);
  res.status(201).json({ success: true, data: approval });
};

const assert_approval_visible = (actor, approval) => {
  if (!approval) throw http_error(404, 'Aprobación no encontrada');
  if (approval.client_id) assert_client_access(actor, approval.client_id);
  else if (actor.type === 'user' && actor.role === 'client')
    throw http_error(403, 'Acceso denegado');
  else if (actor.type === 'bot' && actor.client_ids?.length)
    throw http_error(403, 'Acceso denegado');
};

export const list_approvals = async (req, res) => {
  const filter = {};
  const client_id = scoped_client_id(req.actor, req.query.client_id);
  if (client_id) filter.client_id = client_id;
  if (typeof req.query.status === 'string') filter.status = req.query.status.slice(0, 40);
  const { limit, skip } = clamp_pagination(req.query);
  const [approvals, total] = await Promise.all([
    Approval.find(filter).sort({ updated_at: -1 }).skip(skip).limit(limit),
    Approval.countDocuments(filter),
  ]);
  res.json({ success: true, data: approvals, total });
};

export const get_approval = async (req, res) => {
  const approval = await Approval.findById(req.params.approval_id);
  assert_approval_visible(req.actor, approval);
  res.json({ success: true, data: approval });
};

export const post_domingo = async (req, res) => {
  const approval = await decide_domingo(req.params.approval_id, req.actor, req.body);
  res.json({ success: true, data: approval });
};

export const post_client = async (req, res) => {
  const approval = await decide_cliente(req.params.approval_id, req.actor, req.body);
  res.json({ success: true, data: approval });
};
