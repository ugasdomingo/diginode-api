import http_error from '../utils/http_error.js';

const same_id = (left, right) => left && right && String(left) === String(right);

// Admin sees every client. A client user only sees their own. A bot sees every
// client unless the key was limited to an explicit list.
export const owns_client = (actor, client_id) => {
  if (!client_id) return false;
  if (actor.type === 'bot') {
    if (!actor.client_ids?.length) return true;
    return actor.client_ids.some((id) => same_id(id, client_id));
  }
  if (actor.role === 'admin') return true;
  return same_id(actor.client_id, client_id);
};

export const assert_client_access = (actor, client_id) => {
  if (!owns_client(actor, client_id)) throw http_error(403, 'Acceso denegado');
};

// Prospecting is agency-wide. A key pinned to specific clients must not dump it.
export const assert_prospect_access = (actor) => {
  if (actor.type === 'user' && actor.role === 'client') throw http_error(403, 'Acceso denegado');
  if (actor.type === 'bot' && actor.client_ids?.length) {
    throw http_error(403, 'Esta clave no puede acceder al pipeline de prospectos');
  }
};

// Restricts a list filter to what this actor is allowed to see.
export const scoped_client_id = (actor, requested) => {
  if (actor.type === 'user' && actor.role === 'client') {
    if (requested && !same_id(requested, actor.client_id)) throw http_error(403, 'Acceso denegado');
    if (!actor.client_id) throw http_error(403, 'Acceso denegado');
    return actor.client_id;
  }
  if (actor.type === 'bot' && actor.client_ids?.length) {
    if (requested && !actor.client_ids.some((id) => same_id(id, requested))) {
      throw http_error(403, 'Acceso denegado');
    }
    return requested || { $in: actor.client_ids };
  }
  return requested || undefined;
};
