// ── Single source of truth for the commercial offer ─────────────────────────
// Both the API (checkout + webhook fulfillment) and the client (via GET /api/plans)
// read pricing from here. NEVER hardcode a price elsewhere.
//
// Modelo comercial vigente (decisión 2026-08-14): un solo producto.
//   Clínica Digital — página web + 3 empleados IA, 150€/mes, sin setup y sin
//   trial (cobro inmediato). Alquiler con opción a compra: al pagar la cuota 12
//   el traspaso queda concretado (el cliente es dueño de su dominio y de los
//   datos de sus clientes desde el día 1).
export const PLANS = {
  clinica: {
    slug:               'clinica',
    name:               'Clínica Digital',
    monthly:            150,
    setup:              0,
    employees_included: 3,
    role:               'flagship',
  },
};

// Employees included in Clínica Digital (slugs must exist in VALID_EMPLOYEES of
// client_model): Recepcionista (Nora), Auxiliar Técnico (Alex) y Creador de
// contenido (Valeria).
export const CLINICA_EMPLOYEES = ['recepcionista', 'asistente', 'content-manager'];

// Employee display names for the portal, receipts and emails.
export const EMPLOYEE_NAMES = {
  recepcionista:       'Nora',
  asistente:           'Alex',
  'gestor-relaciones': 'Marcos',
  'content-manager':   'Valeria',
};

// Display-only info for plans that existing clients may still be subscribed to.
// Their Stripe subscriptions keep renewing through the generic webhook handlers;
// this map only feeds the portal so their plan name/price still render.
export const LEGACY_PLAN_INFO = {
  entrepreneur:       { name: 'Plan Entrepreneur',   monthly: 300 },
  'despacho-digital': { name: 'Despacho Digital',    monthly: 300 },
  individual:         { name: 'Empleado Individual', monthly: 180 },
  estudio:            { name: 'Estudio',             monthly: 300 },
};

// Public-facing view of a plan (no internal-only fields to hide for now, but
// centralizing the shape keeps GET /api/plans stable if internals grow).
export const public_plan = (p) => ({
  slug:               p.slug,
  name:               p.name,
  monthly:            p.monthly,
  monthly_promo:      p.monthly_promo ?? null,
  promo_months:       p.promo_months ?? 0,
  setup:              p.setup,
  employees_included: p.employees_included ?? null,
  role:               p.role,
});
