import {
  list_conversations,
  get_conversation,
  update_conversation,
  append_message,
} from '../services/airtable_service.js';
import { send_dm, reply_to_comment } from '../services/instagram_service.js';
import { invalidate_faq_cache } from '../services/airtable_service.js';

// GET /api/admin/conversations?estado=activo
const get_conversations = async (req, res, next) => {
  try {
    const { estado } = req.query;
    const conversations = await list_conversations({ estado, limit: 100 });
    res.json({ success: true, data: conversations });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/conversations/:record_id
const get_conversation_detail = async (req, res, next) => {
  try {
    const conv = await get_conversation(req.params.record_id);
    res.json({ success: true, data: conv });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/conversations/:record_id
// Body: { estado?, tomado_por_humano?, notas? }
const patch_conversation = async (req, res, next) => {
  try {
    const { estado, tomado_por_humano, notas } = req.body;
    const conv = await update_conversation(req.params.record_id, {
      estado,
      tomado: tomado_por_humano,
      notas,
    });
    res.json({ success: true, data: conv });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/conversations/:record_id/reply
// Body: { text }
// Sends a human reply via Instagram and saves it in Airtable
const send_human_reply = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'text es obligatorio' });
    }

    const conv = await get_conversation(req.params.record_id);

    // Send via the appropriate Instagram channel
    if (conv.plataforma === 'instagram_dm') {
      await send_dm(conv.contact_id, text);
    } else if (conv.plataforma === 'instagram_comment') {
      // For comments: reply publicly. If you prefer DM, swap send_dm here.
      await send_dm(conv.contact_id, text);
    }

    // Persist the human turn and mark as taken
    const updated = await append_message(
      conv.id,
      { role: 'human', content: text },
      { estado: 'activo', tomado: true }
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/faqs/refresh
// Forces the FAQ cache to reload on next agent call
const refresh_faqs = async (_req, res, next) => {
  try {
    invalidate_faq_cache();
    res.json({ success: true, message: 'Caché de FAQs invalidado' });
  } catch (err) {
    next(err);
  }
};

export {
  get_conversations,
  get_conversation_detail,
  patch_conversation,
  send_human_reply,
  refresh_faqs,
};
