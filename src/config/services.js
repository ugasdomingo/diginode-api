import { PLANS } from './plans.js';

export const PRIVACY_VERSION = '2026-10';
export const SERVICE_IDS = ['brand_management', 'web_project', 'digital_clinic', 'undecided'];
export const SERVICES = [
  {
    id: 'brand_management',
    name: 'Gestión de marca y marketing',
    path: '/',
    pricing: 'Propuesta según tu operación',
    scales: [
      {
        id: 'micro',
        name: 'Microempresa',
        description: 'Un decisor y coordinación sencilla. Reunión estratégica mensual.',
      },
      {
        id: 'sme',
        name: 'Pyme',
        description: 'Equipo, varias líneas o sedes. Reunión estratégica quincenal.',
      },
    ],
  },
  {
    id: 'web_project',
    name: 'Webs y aplicaciones',
    path: '/webs-y-aplicaciones',
    pricing: 'Presupuesto según alcance',
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
      label: context === 'web' ? 'Pedir presupuesto' : 'Solicitar revisión',
      href: contact,
    },
  ];
  const booking = booking_link();
  if (booking)
    actions.push({ type: 'booking', label: 'Concertar una reunión real', href: booking });
  return actions;
}
