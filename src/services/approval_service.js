import Approval from '../models/approval_model.js';
import Piece from '../models/piece_model.js';
import Lead from '../models/lead_model.js';
import { emit_agency_event, agency_item_url } from './agency_notify_service.js';
import http_error from '../utils/http_error.js';

// Domingo primero. Si el cliente (o Domingo) rechaza, la pieza vuelve al bot
// en estado `devuelto` y el siguiente envío arranca otra vez en Domingo.
// `solo_domingo` cubre piezas de prospección, que todavía no tienen cliente.

const EARLY_PIPELINE = ['nuevo', 'analizado', 'pieza_lista'];

const piece_status_for = (approval_status) => {
  if (approval_status === 'aprobado') return 'aprobado';
  if (approval_status === 'devuelto') return 'borrador';
  return 'en_revision';
};

const audit_entry = (actor, action, comment) => ({
  at: new Date(),
  actor_type: actor.type === 'bot' ? 'bot' : actor.role,
  actor_id: String(actor.id),
  actor_label: String(actor.label || '').slice(0, 160),
  action,
  ...(comment ? { comment: String(comment).slice(0, 1000) } : {}),
});

const notify = async (approval, piece, status) => {
  await emit_agency_event({
    event: 'approval.status_changed',
    status,
    title: piece?.title || piece?.type || 'pieza',
    url: agency_item_url('aprobaciones', approval._id),
    approval_id: approval._id,
    piece_id: piece?._id || approval.piece_id,
    client_id: approval.client_id,
  });
};

const touch_lead_pipeline = async (lead_id) => {
  if (!lead_id) return;
  await Lead.updateOne(
    { _id: lead_id, pipeline_status: { $in: EARLY_PIPELINE } },
    { $set: { pipeline_status: 'pendiente_de_aprobacion' } }
  );
};

export const submit_piece = async (piece, actor) => {
  if (!piece) throw http_error(404, 'Pieza no encontrada');
  if (piece.status === 'archivado') throw http_error(409, 'La pieza está archivada');
  if (!piece.client_id && !piece.lead_id)
    throw http_error(400, 'La pieza no tiene cliente ni lead');

  const mode = piece.client_id ? 'dos_fases' : 'solo_domingo';
  const existing = await Approval.findOne({ piece_id: piece._id });

  if (!existing) {
    let approval;
    try {
      approval = await Approval.create({
        piece_id: piece._id,
        client_id: piece.client_id,
        lead_id: piece.lead_id,
        mode,
        status: 'pendiente_domingo',
        round: 1,
        author_bot: piece.author_bot || actor.label,
        audit: [audit_entry(actor, 'enviada')],
      });
    } catch (err) {
      if (err?.code === 11000) throw http_error(409, 'La pieza ya está en un ciclo de aprobación');
      throw err;
    }
    await Piece.findByIdAndUpdate(piece._id, { status: 'en_revision' });
    await touch_lead_pipeline(piece.lead_id);
    await notify(approval, piece, 'pendiente_domingo');
    return approval;
  }

  if (existing.status !== 'devuelto') {
    throw http_error(409, 'La pieza ya está en un ciclo de aprobación');
  }

  const approval = await Approval.findOneAndUpdate(
    { _id: existing._id, status: 'devuelto' },
    {
      $set: {
        status: 'pendiente_domingo',
        mode,
        client_id: piece.client_id,
        lead_id: piece.lead_id,
        author_bot: piece.author_bot || existing.author_bot,
      },
      $inc: { round: 1 },
      $push: { audit: audit_entry(actor, 'reenviada') },
    },
    { new: true }
  );
  if (!approval) throw http_error(409, 'La pieza ya está en un ciclo de aprobación');
  await Piece.findByIdAndUpdate(piece._id, { status: 'en_revision' });
  await notify(approval, piece, 'pendiente_domingo');
  return approval;
};

export const decide_domingo = async (approval_id, actor, { decision, comment }) => {
  if (actor.type !== 'user' || actor.role !== 'admin') {
    throw http_error(403, 'Solo Domingo puede resolver esta fase');
  }
  if (decision === 'rechazar' && !comment) {
    throw http_error(400, 'El rechazo necesita un comentario');
  }

  const current = await Approval.findById(approval_id);
  if (!current) throw http_error(404, 'Aprobación no encontrada');
  if (current.status !== 'pendiente_domingo') throw http_error(409, 'No está pendiente de Domingo');

  const next =
    decision === 'aprobar'
      ? current.mode === 'solo_domingo'
        ? 'aprobado'
        : 'pendiente_cliente'
      : 'devuelto';
  const action = decision === 'aprobar' ? 'aprobada_domingo' : 'rechazada_domingo';

  const approval = await Approval.findOneAndUpdate(
    { _id: approval_id, status: 'pendiente_domingo' },
    { $set: { status: next }, $push: { audit: audit_entry(actor, action, comment) } },
    { new: true }
  );
  if (!approval) throw http_error(409, 'La aprobación cambió; recarga e inténtalo de nuevo');

  const piece = await Piece.findByIdAndUpdate(
    approval.piece_id,
    { status: piece_status_for(next) },
    { new: true }
  );
  await notify(approval, piece, next);
  return approval;
};

export const decide_cliente = async (approval_id, actor, { decision, comment }) => {
  if (actor.type !== 'user' || actor.role !== 'client') {
    throw http_error(403, 'Solo el cliente puede resolver esta fase');
  }
  if (decision === 'rechazar' && !comment) {
    throw http_error(400, 'El rechazo necesita un comentario');
  }

  const current = await Approval.findById(approval_id);
  if (!current) throw http_error(404, 'Aprobación no encontrada');
  if (!current.client_id || String(current.client_id) !== String(actor.client_id || '')) {
    throw http_error(403, 'Acceso denegado');
  }
  if (current.status !== 'pendiente_cliente') {
    throw http_error(409, 'Aún no está pendiente del cliente');
  }

  const next = decision === 'aprobar' ? 'aprobado' : 'devuelto';
  const action = decision === 'aprobar' ? 'aprobada_cliente' : 'rechazada_cliente';

  const approval = await Approval.findOneAndUpdate(
    { _id: approval_id, status: 'pendiente_cliente' },
    { $set: { status: next }, $push: { audit: audit_entry(actor, action, comment) } },
    { new: true }
  );
  if (!approval) throw http_error(409, 'La aprobación cambió; recarga e inténtalo de nuevo');

  const piece = await Piece.findByIdAndUpdate(
    approval.piece_id,
    { status: piece_status_for(next) },
    { new: true }
  );
  await notify(approval, piece, next);
  return approval;
};
