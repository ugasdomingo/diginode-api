import AgencyEvent from '../models/agency_event_model.js';
import logger from '../utils/logger.js';

const timeout_ms = () => Number(process.env.OPS_SLACK_TIMEOUT_MS ?? 5000);

export const agency_item_url = (kind, id) => {
  const base = (process.env.AGENCY_APP_URL || `${process.env.FRONTEND_URL || ''}/agencia`).replace(
    /\/$/,
    ''
  );
  return `${base}/${kind}/${id}`;
};

const one_line = (value, max = 80) =>
  String(value || 'elemento')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const status_line = (event, status) => {
  if (event === 'approval.status_changed') return `Aprobación ${status}`;
  if (event === 'invoice.paid') return 'Factura pagada';
  return one_line(event, 40);
};

const post_json = async (url, payload) => {
  if (!url) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms());
  try {
    await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.warn({ reason: err?.name || 'fetch_failed' }, 'aviso de agencia no entregado');
  } finally {
    clearTimeout(timer);
  }
};

// Persists the event and notifies Slack / a machine webhook.
// The message is one line plus a link. Comments and piece bodies stay out.
export const emit_agency_event = async ({
  event,
  status,
  title,
  url,
  approval_id,
  piece_id,
  client_id,
  resource_id,
}) => {
  const id = approval_id || resource_id || piece_id || client_id || '';
  const kind = event === 'invoice.paid' ? 'facturas' : 'aprobaciones';
  const link = url || agency_item_url(kind, id);
  const label = one_line(title);
  const text = `${status_line(event, status)} · ${label} · ${link}`;

  try {
    await AgencyEvent.create({
      event,
      status,
      title: label,
      url: link,
      approval_id,
      piece_id,
      client_id,
      resource_id: resource_id || approval_id,
    });
  } catch (err) {
    logger.warn({ reason: err?.message }, 'no se pudo guardar el evento de agencia');
  }

  await post_json(process.env.AGENCY_SLACK_WEBHOOK_URL || process.env.DIGINODE_OPS_SLACK_WEBHOOK, {
    text,
  });
  await post_json(process.env.AGENCY_EVENT_WEBHOOK_URL, {
    event,
    status,
    approval_id: approval_id ? String(approval_id) : undefined,
    piece_id: piece_id ? String(piece_id) : undefined,
    client_id: client_id ? String(client_id) : undefined,
    resource_id: resource_id ? String(resource_id) : undefined,
    url: link,
  });
};
