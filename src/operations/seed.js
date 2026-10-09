import { CATALOG_VERSION } from './catalog.js';

export function create_operations_seed() {
  const common = { country: 'ES', timezone: 'Europe/Madrid', assistant_name: 'Nora', tone: 'Claro, cercano y profesional. Usa solamente la información aprobada.', cancellation_hours: 24, faq: [] };
  return {
    version: 1, catalogue_version: CATALOG_VERSION, revision: 0,
    businesses: [
      { id: 'diginode', config: { ...common, name: 'Diginode', owner_email: 'fundador@diginode.example', faq: [{ question: '¿Qué incluye Diginode?', answer: 'Una web, un panel y departamentos de recepción, agenda, administración, marketing y calidad. Puedes reservar una asesoría gratuita para ver si encaja contigo.' }] }, plan: 'consulta', services: [{ id: 'asesoria', name: 'Asesoría gratuita', duration_minutes: 30, price_cents: 0, currency: 'EUR' }], onboarding: null, subscription: 'not_started', status: 'configuring', paused: false },
      { id: 'consulta-demo', config: { ...common, name: 'Consulta de prueba', owner_email: 'profesional@consulta.example', faq: [{ question: '¿Cómo son las sesiones?', answer: 'La consulta ofrece sesiones individuales de 60 minutos. Esta cuenta es ficticia y sirve para probar la gestión administrativa.' }] }, plan: 'esencial', services: [{ id: 'sesion', name: 'Sesión individual de prueba', duration_minutes: 60, price_cents: 5000, currency: 'EUR' }], onboarding: null, subscription: 'not_started', status: 'configuring', paused: false },
    ],
    contacts: [], messages: [], appointments: [], contents: [], jobs: [], deliveries: [], audit: [], usage: [], payments: [],
  };
}
