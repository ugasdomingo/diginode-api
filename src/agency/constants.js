// Valores estables para bots y para Mongo. Las etiquetas en español
// (acentos, espacios, «reunión/visita») viven en PIPELINE_LABELS.
export const PIPELINE_STATUSES = [
  'nuevo',
  'analizado',
  'pieza_lista',
  'pendiente_de_aprobacion',
  'contactado',
  'respondio',
  'reunion_visita',
  'ganado',
  'perdido',
];

export const PIPELINE_LABELS = {
  nuevo: 'nuevo',
  analizado: 'analizado',
  pieza_lista: 'pieza lista',
  pendiente_de_aprobacion: 'pendiente de aprobación',
  contactado: 'contactado',
  respondio: 'respondió',
  reunion_visita: 'reunión/visita',
  ganado: 'ganado',
  perdido: 'perdido',
};

export const ACTIVITY_TYPES = [
  'mensaje_enviado',
  'pieza_enviada',
  'respuesta',
  'nota',
  'siguiente_accion',
];

export const PIECE_TYPES = [
  'post',
  'reel',
  'story',
  'carrusel',
  'email',
  'web',
  'anuncio',
  'informe',
  'otro',
];

export const PIECE_STATUSES = ['borrador', 'en_revision', 'aprobado', 'publicado', 'archivado'];

export const APPROVAL_STATUSES = ['pendiente_domingo', 'pendiente_cliente', 'aprobado', 'devuelto'];

export const REPORT_STATUSES = ['borrador', 'enviado'];

export const MEETING_STATUSES = ['programada', 'hecha', 'cancelada'];

export const INVOICE_STATUSES = ['borrador', 'pendiente', 'pagada', 'anulada', 'revision'];

export const CREDENTIAL_PROVIDERS = [
  'meta_business',
  'google_business',
  'web',
  'analytics',
  'otro',
];

export const LEAD_SOURCES = [
  'organic',
  'ads',
  'demo_whatsapp',
  'web_form',
  'other',
  'referido',
  'manual',
];

export const CLIENT_STATUSES = ['pending', 'active', 'suspended', 'cancelled'];

// Permisos de una clave de bot. No hay comodín: hay que listarlos.
export const API_SCOPES = [
  'leads:read',
  'leads:write',
  'clients:read',
  'clients:write',
  'pieces:read',
  'pieces:write',
  'approvals:read',
  'approvals:write',
  'reports:read',
  'reports:write',
  'meetings:read',
  'meetings:write',
  'invoices:read',
  'invoices:write',
  'vault:read',
  'vault:write',
  'snapshot:read',
  'events:read',
];
