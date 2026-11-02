import { LATAM } from '../config/questionnaire.js';

// Internal starting point for a proposal. The owner reviews and edits it before sending;
// it is never shown to the visitor. Amounts are net (before VAT).
const round10 = (value) => Math.round(value / 10) * 10;

export function suggest_price(service_interest, q = {}) {
  const latam = LATAM.includes(q.country);
  const currency = latam ? 'USD' : 'EUR';
  const notes = [];
  if (service_interest === 'web_project') {
    const goals = q.web_goals ?? [];
    let amount = 1900;
    if (goals.includes('sell_online')) {
      amount += 1500;
      notes.push('Venta online +1.500');
    }
    if (goals.includes('operations')) {
      amount += 2000;
      notes.push('Gestión interna +2.000');
    }
    const extra = goals.filter((goal) => !['sell_online', 'operations', 'other'].includes(goal));
    if (extra.length > 1) {
      amount += (extra.length - 1) * 400;
      notes.push('Objetivos adicionales');
    }
    if (q.brand_identity === 'no') {
      amount += 500;
      notes.push('Identidad de marca +500');
    }
    if (q.deadline === 'lt1m') {
      amount *= 1.2;
      notes.push('Urgencia +20 %');
    }
    if (latam) {
      amount *= 0.52;
      notes.push('Tarifa Latinoamérica');
    }
    return { kind: 'one_time', currency, one_time: round10(amount), notes };
  }
  const sme =
    ['11-20', '21-50', '50+'].includes(q.employees) ||
    (q.locations !== undefined && q.locations !== '1') ||
    ['500k-2m', 'gt2m'].includes(q.revenue);
  let monthly = sme ? 1890 : 890;
  let setup = sme ? 990 : 490;
  notes.push(sme ? 'Escala pyme' : 'Escala microempresa');
  const channels = (q.channels ?? []).length;
  if (channels > 3) {
    monthly += (channels - 3) * 100;
    notes.push(`${channels} canales`);
  }
  if (q.locations === '4+') {
    monthly += 300;
    notes.push('Más de 3 sedes');
  }
  if (q.revenue === 'gt2m') {
    monthly += 400;
    notes.push('Facturación > 2 M€');
  }
  if (q.marketing_spend === 'gt3000') {
    monthly += 200;
    notes.push('Inversión alta a gestionar');
  }
  if (latam) {
    monthly *= 0.66;
    setup *= 0.8;
    notes.push('Tarifa Latinoamérica');
  }
  return { kind: 'subscription', currency, monthly: round10(monthly), setup: round10(setup), notes };
}
