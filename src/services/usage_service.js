import Usage from '../models/usage_model.js';

// ── AI usage limits (F1-3) ──────────────────────────────────────────────────
// Monthly message allowance per plan slug. Starting values — ajustables por el
// humano una vez haya datos reales de consumo/coste.
export const PLAN_MESSAGE_LIMITS = {
  entrepreneur: 4000,
  individual:   2000,
  estudio:      5000,
  clinica:     12000,
};

// Demo (Nora pública) — límite por contacto, no por mes. Crítico para que la
// demo abierta al público no dispare el coste de la API de IA.
export const DEMO_MESSAGE_LIMIT = 15;

const current_month = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM'

// Records one AI turn for a paying client: accumulates tokens and +1 message.
// No-op without a client_id (e.g. anonymous prospects / demo handled separately).
export const record_usage = async (client_id, { input_tokens = 0, output_tokens = 0 } = {}) => {
  if (!client_id) return;
  await Usage.findOneAndUpdate(
    { client_id, month: current_month() },
    { $inc: { input_tokens, output_tokens, message_count: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const messages_this_month = async (client_id) => {
  if (!client_id) return 0;
  const doc = await Usage.findOne({ client_id, month: current_month() });
  return doc?.message_count ?? 0;
};

// True when the client has reached its plan's monthly message allowance.
// Unknown plans never block (fail-open) to avoid cutting off legitimate clients.
export const over_monthly_limit = async (client_id, plan) => {
  const limit = PLAN_MESSAGE_LIMITS[plan];
  if (!limit || !client_id) return false;
  return (await messages_this_month(client_id)) >= limit;
};
