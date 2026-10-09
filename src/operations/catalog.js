// Versioned catalogue for the operational kernel. Legacy billing stays separate.
export const CATALOG_VERSION = '2026-10-09';
export const DEPARTMENTS = ['recepcion', 'agenda', 'administracion', 'marketing', 'calidad'];
export const OPERATIONS_PLANS = Object.freeze({
  esencial: Object.freeze({ slug: 'esencial', name: 'Esencial', currency: 'EUR', monthly_cents: 7900, setup_cents: 9900, responses: 300, content: 4, channels: ['web', 'email'] }),
  consulta: Object.freeze({ slug: 'consulta', name: 'Consulta', currency: 'EUR', monthly_cents: 14900, setup_cents: 14900, responses: 1000, content: 12, channels: ['web', 'email', 'whatsapp'] }),
  crecimiento: Object.freeze({ slug: 'crecimiento', name: 'Crecimiento', currency: 'EUR', monthly_cents: 24900, setup_cents: 24900, responses: 2500, content: 20, channels: ['web', 'email', 'whatsapp', 'instagram'] }),
});

export const get_operations_plan = (slug) => OPERATIONS_PLANS[slug] ?? null;
