import Airtable from 'airtable';

// ── Config ──────────────────────────────────────────────────────────────────
const BASE_ID   = 'appg3sqgom3NIQuYy';
const TABLE_FAQS  = 'tblmmLyELanbMryr0';
const TABLE_CONV  = 'tbl03ciTr2AIYO1KK';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(BASE_ID);

// ── FAQ cache (TTL 10 min) ──────────────────────────────────────────────────
let faq_cache     = null;
let faq_cache_at  = 0;
const FAQ_TTL_MS  = 10 * 60 * 1000;

const get_faqs = async () => {
  if (faq_cache && Date.now() - faq_cache_at < FAQ_TTL_MS) return faq_cache;

  const records = await base(TABLE_FAQS)
    .select({ filterByFormula: '{Activa} = TRUE()', fields: ['Pregunta', 'Respuesta', 'Categoria'] })
    .all();

  faq_cache    = records.map(r => ({ pregunta: r.fields.Pregunta, respuesta: r.fields.Respuesta, categoria: r.fields.Categoria }));
  faq_cache_at = Date.now();
  return faq_cache;
};

/** Force-reload FAQs (call from admin endpoint when FAQs are updated) */
const invalidate_faq_cache = () => { faq_cache = null; };

// ── Conversations ───────────────────────────────────────────────────────────

/**
 * Finds an existing conversation record by Contact_ID + Plataforma.
 * Returns null if not found.
 */
const find_conversation = async (contact_id, plataforma) => {
  const records = await base(TABLE_CONV)
    .select({
      filterByFormula: `AND({Contact_ID} = '${contact_id}', {Plataforma} = '${plataforma}')`,
      maxRecords: 1,
    })
    .all();

  if (!records.length) return null;
  return _parse_record(records[0]);
};

/**
 * Creates a new conversation record.
 * Returns the created conversation object.
 */
const create_conversation = async ({ contact_id, nombre, username, plataforma, lead_id }) => {
  const record = await base(TABLE_CONV).create({
    Contact_ID:        contact_id,
    Nombre:            nombre ?? contact_id,
    Username:          username ?? '',
    Plataforma:        plataforma,
    Estado:            'nuevo',
    Mensajes:          JSON.stringify([]),
    Lead_ID:           lead_id ?? '',
    Tomado_por_humano: false,
    Ultima_actividad:  new Date().toISOString(),
  });

  return _parse_record(record);
};

/**
 * Appends a message turn to an existing conversation and updates metadata.
 * turn = { role: 'user' | 'agent' | 'human', content: string }
 */
const append_message = async (record_id, turn, { estado, tomado } = {}) => {
  const record = await base(TABLE_CONV).find(record_id);
  const messages = _safe_parse(record.fields.Mensajes ?? '[]');

  messages.push({ ...turn, ts: new Date().toISOString() });

  const update = {
    Mensajes:         JSON.stringify(messages),
    Ultima_actividad: new Date().toISOString(),
  };
  if (estado)              update.Estado            = estado;
  if (tomado !== undefined) update.Tomado_por_humano = tomado;

  const updated = await base(TABLE_CONV).update(record_id, update);
  return _parse_record(updated);
};

/**
 * Updates Estado and/or Tomado_por_humano on a conversation.
 */
const update_conversation = async (record_id, { estado, tomado, notas } = {}) => {
  const update = {};
  if (estado  !== undefined) update.Estado            = estado;
  if (tomado  !== undefined) update.Tomado_por_humano = tomado;
  if (notas   !== undefined) update.Notas             = notas;

  const updated = await base(TABLE_CONV).update(record_id, update);
  return _parse_record(updated);
};

/**
 * Returns a paginated list of conversations sorted by Ultima_actividad desc.
 * Airtable doesn't support DESC sort natively — we sort client-side after fetch.
 */
const list_conversations = async ({ estado, limit = 50 } = {}) => {
  const filter = estado ? `{Estado} = '${estado}'` : '';
  const records = await base(TABLE_CONV)
    .select({ ...(filter && { filterByFormula: filter }), maxRecords: limit })
    .all();

  return records
    .map(_parse_record)
    .sort((a, b) => new Date(b.ultima_actividad) - new Date(a.ultima_actividad));
};

/**
 * Returns a single conversation by Airtable record ID.
 */
const get_conversation = async (record_id) => {
  const record = await base(TABLE_CONV).find(record_id);
  return _parse_record(record);
};

// ── Private helpers ─────────────────────────────────────────────────────────

const _parse_record = (record) => ({
  id:                 record.id,
  contact_id:         record.fields.Contact_ID  ?? '',
  nombre:             record.fields.Nombre       ?? '',
  username:           record.fields.Username     ?? '',
  plataforma:         record.fields.Plataforma   ?? '',
  estado:             record.fields.Estado       ?? 'nuevo',
  mensajes:           _safe_parse(record.fields.Mensajes ?? '[]'),
  lead_id:            record.fields.Lead_ID      ?? '',
  tomado_por_humano:  record.fields.Tomado_por_humano ?? false,
  ultima_actividad:   record.fields.Ultima_actividad ?? null,
  notas:              record.fields.Notas        ?? '',
});

const _safe_parse = (str) => {
  try { return JSON.parse(str); } catch { return []; }
};

export {
  get_faqs,
  invalidate_faq_cache,
  find_conversation,
  create_conversation,
  append_message,
  update_conversation,
  list_conversations,
  get_conversation,
};
