// ── Single source of truth for commercial plans ─────────────────────────────
// Both the API (checkout + webhook fulfillment) and the client (via GET /api/plans)
// read pricing from here. NEVER hardcode a price elsewhere.
//
// `role` drives how the client surfaces each plan:
//   flagship → the only offer shown on the public site (Plan Entrepreneur)
//   upsell   → offered in the sales conversation to clients with a team
//   downsell → offered to price-sensitive prospects
//
// Amounts are EUR/month. `setup` is a one-time fee in EUR (0 = included).
//
// ⚠️ PENDIENTE DE DECISIÓN HUMANA: la tabla de decisiones de PLAN_DE_ACCION.md
// menciona un downsell "solo Nora" a 150€/mes. El producto `individual` que ya
// se cobra hoy es 180€/mes + 200€ setup. Los números de abajo reflejan lo que
// Stripe cobra HOY (línea roja: no cambiar precios sin confirmar). Si se quiere
// el downsell a 150€, hay que crearlo como variante y confirmarlo.
export const PLANS = {
  entrepreneur: {
    slug:               'entrepreneur',
    name:               'Plan Entrepreneur',
    monthly_promo:      300,   // primeros `promo_months`
    promo_months:       6,
    monthly:            200,   // a partir del mes 7
    setup:              0,     // incluido
    employees_included: 2,     // Alex + 1 a elegir en onboarding
    role:               'flagship',
  },
  individual: {
    slug:    'individual',
    name:    'Empleado Individual',
    monthly: 180,
    setup:   200,
    role:    'downsell',
  },
  estudio: {
    slug:    'estudio',
    name:    'Estudio',
    monthly: 300,
    setup:   350,
    role:    'upsell',
  },
  clinica: {
    slug:    'clinica',
    name:    'Clínica',
    monthly: 500,
    setup:   550,
    role:    'upsell',
  },
};

// Slugs handled by the AI-employee plan checkout (setup + monthly subscription).
export const AI_PLAN_SLUGS = ['individual', 'estudio', 'clinica'];

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
