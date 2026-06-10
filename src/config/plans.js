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
// Estructura comercial vigente (decisión 2026-06-10):
//   flagship  Plan Entrepreneur — 300€/mes plano (sin promo, sin permanencia)
//   upsell    Clínica           — 500€/mes (negocios con equipo)
//   downsell  Empleado Individual — 180€/mes ("solo Nora")
// `estudio` (300€) se conserva como producto interno ya existente en Stripe; no
// se muestra en la web pública (solo se ofrece flagship). Roles → ver `role`.
export const PLANS = {
  entrepreneur: {
    slug:               'entrepreneur',
    name:               'Plan Entrepreneur',
    monthly:            300,   // precio plano, sin promoción
    setup:              0,     // incluido
    employees_included: 2,     // Alex + 1 a elegir en onboarding
    role:               'flagship',
  },
  clinica: {
    slug:    'clinica',
    name:    'Clínica',
    monthly: 500,
    setup:   550,
    role:    'upsell',
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
    role:    'internal',
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
