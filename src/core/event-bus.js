// ── Client-scoped Event Bus ──────────────────────────────────────────────────
// Employees within the SAME client can communicate via this bus.
// Strict isolation: events are always scoped to a client_id.
// Employees of different clients can NEVER exchange events.
//
// Implementation: in-memory pub/sub for Phase 1 (supports up to ~20 clients).
// Upgrade path: swap the store Map for MongoDB Change Streams or BullMQ
// when scaling beyond 50 clients without changing the public API.

import { EventEmitter } from 'events';

// One emitter per client_id to guarantee isolation
const _emitters = new Map();

const _get_emitter = (client_id) => {
  if (!_emitters.has(client_id)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20); // up to 4 employees × 5 event types each
    _emitters.set(client_id, emitter);
  }
  return _emitters.get(client_id);
};

/**
 * Publish an event scoped to a specific client.
 * @param {string} client_id  - MongoDB ObjectId string of the client
 * @param {string} type       - Event type, e.g. 'APPOINTMENT_BOOKED'
 * @param {string} from       - Emitting employee slug, e.g. 'recepcionista'
 * @param {object} payload    - Arbitrary data for the receiving employee
 */
const publish = (client_id, { type, from, payload = {} }) => {
  if (!client_id || !type || !from) {
    throw new Error('event-bus.publish requires client_id, type and from');
  }

  const event = { type, from, payload, client_id, timestamp: new Date() };
  _get_emitter(client_id).emit(type, event);
};

/**
 * Subscribe an employee to one or more event types for a specific client.
 * @param {string}   client_id  - MongoDB ObjectId string
 * @param {string[]} types      - Event types to listen for
 * @param {string}   employee   - Subscribing employee slug
 * @param {Function} handler    - Called with the full event object
 * @returns {Function}          - Unsubscribe function
 */
const subscribe = (client_id, { types, employee, handler }) => {
  if (!client_id || !types?.length || !employee || typeof handler !== 'function') {
    throw new Error('event-bus.subscribe requires client_id, types, employee and handler');
  }

  const emitter = _get_emitter(client_id);

  const wrapped_handler = (event) => {
    // Extra guard: reject cross-client events (should never happen, but be safe)
    if (event.client_id !== client_id) return;
    handler(event);
  };

  for (const type of types) {
    emitter.on(type, wrapped_handler);
  }

  // Return unsubscribe function for cleanup
  return () => {
    for (const type of types) {
      emitter.off(type, wrapped_handler);
    }
  };
};

/**
 * Tear down the emitter for a client (call on cancellation/cleanup).
 * @param {string} client_id
 */
const destroy = (client_id) => {
  if (_emitters.has(client_id)) {
    _emitters.get(client_id).removeAllListeners();
    _emitters.delete(client_id);
  }
};

export { publish, subscribe, destroy };
