import mongoose from 'mongoose';

// Una visita a una página de la web pública.
//
// Diseñado para NO poder identificar a nadie, que es lo que permite medir sin
// pedir consentimiento de cookies (analítica propia y agregada, sin seguimiento
// entre sitios ni entre días):
//   - No se guarda la IP en ningún momento, ni completa ni truncada.
//   - `visitor_hash` es un SHA-256 de IP + user-agent + una sal que CAMBIA CADA
//     DÍA. Sirve para no contar diez veces a la misma persona dentro del mismo
//     día, y es inútil para seguirla al día siguiente: mañana su hash es otro.
//   - `session_id` lo genera el navegador en memoria y muere al cerrar la
//     pestaña. No se escribe ninguna cookie ni nada en localStorage.
//   - Los documentos se borran solos a los 90 días (índice TTL de abajo); los
//     totales del panel se calculan sobre lo que quede vivo.
const pageview_schema = new mongoose.Schema(
  {
    // Hash irreversible y rotado a diario. Nunca la IP.
    visitor_hash: {
      type: String,
      required: true,
      index: true,
    },
    // Identificador efímero de pestaña, para casar la visita con su duración.
    session_id: {
      type: String,
      required: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Canal de origen ya categorizado: no guardamos la URL completa de
    // procedencia, que puede llevar datos personales en sus parámetros.
    source: {
      type: String,
      enum: ['directo', 'instagram', 'facebook', 'google', 'whatsapp', 'otro'],
      default: 'directo',
      index: true,
    },
    device: {
      type: String,
      enum: ['movil', 'escritorio', 'tablet'],
      default: 'escritorio',
    },
    // Tiempo con la página realmente visible, en segundos. Llega en un segundo
    // aviso al salir, así que arranca a 0 y puede quedarse ahí si el navegador
    // se cierra de golpe.
    duration_seconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Hitos de la landing: 'checkout_click' al pulsar comprar, 'purchase' al
    // confirmarse el pago. Vacío en una visita normal.
    events: {
      type: [String],
      default: [],
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

// Borrado automático a los 90 días: no guardamos datos de navegación
// indefinidamente ni aunque sean anónimos.
pageview_schema.index({ created_at: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// El panel agrupa por día y por página dentro de un rango.
pageview_schema.index({ created_at: -1, path: 1 });

const PageView = mongoose.model('PageView', pageview_schema);

export default PageView;
