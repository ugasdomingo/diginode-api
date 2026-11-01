import { PLANS } from './plans.js';

export const PRIVACY_VERSION = '2026-10';
export const WHATSAPP_URL = 'https://wa.me/34604822385';
export const TELEGRAM_URL = 'https://t.me/+34604822385';
export const SERVICE_IDS = ['brand_management', 'web_project', 'digital_clinic', 'undecided'];
export const SERVICES = [
  {
    id: 'brand_management',
    name: 'Departamento de marketing',
    path: '/',
    pricing: 'Plan a medida desde 890 €/mes + IVA',
    scales: [
      {
        id: 'micro',
        name: 'Microempresa',
        description: 'Un decisor y operación sencilla. Reunión estratégica mensual.',
        monthly: 890,
        setup: 490,
        currency: 'EUR',
        latam_monthly_usd: 590,
        latam_setup_usd: 390,
      },
      {
        id: 'sme',
        name: 'Pyme',
        description: 'Equipo, varias líneas o sedes. Reunión estratégica quincenal.',
        monthly: 1890,
        setup: 990,
        currency: 'EUR',
        latam_monthly_usd: 1190,
        latam_setup_usd: 790,
      },
    ],
  },
  {
    id: 'web_project',
    name: 'Creación de páginas web',
    path: '/webs-y-aplicaciones',
    pricing: 'Desde 1.900 € + IVA',
    from_price: 1900,
    currency: 'EUR',
    latam_from_usd: 990,
  },
  {
    id: 'digital_clinic',
    name: PLANS.clinica.name,
    path: '/clinica-digital',
    monthly: PLANS.clinica.monthly,
    currency: 'EUR',
    setup: PLANS.clinica.setup,
  },
];

export function booking_link() {
  try {
    const url = new URL(process.env.CAL_BOOKING_LINK);
    return url.protocol === 'https:' && url.hostname === 'cal.com' ? url.href : null;
  } catch {
    return null;
  }
}

export function demo_actions(context = 'clinic') {
  const contact =
    context === 'web'
      ? '/webs-y-aplicaciones#contacto'
      : context === 'clinic'
        ? '/clinica-digital#contacto'
        : '/#contacto';
  const actions = [
    {
      type: 'contact',
      label: context === 'web' ? 'Pedir presupuesto' : 'Pedir mi plan a medida',
      href: contact,
    },
  ];
  actions.push({ type: 'direct', label: 'Escribir por WhatsApp', href: WHATSAPP_URL });
  const booking = booking_link();
  if (booking)
    actions.push({ type: 'booking', label: 'Concertar una reunión real', href: booking });
  return actions;
}
