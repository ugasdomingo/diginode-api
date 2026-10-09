import { randomUUID } from 'node:crypto';
import { OPERATIONS_PLANS, CATALOG_VERSION, DEPARTMENTS } from './catalog.js';
import { business_config_schema, contact_schema, message_schema, booking_schema, content_input_schema, content_edit_schema, schedule_schema, onboarding_schema } from './schemas.js';

export class OperationsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new OperationsError(status, message); };
const scoped = (items, tenant_id, id) => items.find((item) => item.tenant_id === tenant_id && item.id === id) ?? fail(404, 'Registro no encontrado.');
const business = (state, tenant_id) => state.businesses.find((item) => item.id === tenant_id) ?? fail(404, 'Negocio no encontrado.');
const quota = (state, tenant_id, now) => {
  const month = now.toISOString().slice(0, 7);
  let usage = state.usage.find((item) => item.tenant_id === tenant_id && item.month === month);
  if (!usage) { usage = { tenant_id, month, responses: 0, content: 0, cost_cents: 0 }; state.usage.push(usage); }
  return usage;
};
const audit = (state, tenant_id, action, resource_id, now) => {
  state.audit.push({ id: randomUUID(), tenant_id, action, resource_id, created_at: now.toISOString() });
};
const add_job = (state, tenant_id, type, resource_id, due_at, key, revision = null) => {
  if (state.jobs.some((job) => job.tenant_id === tenant_id && job.key === key)) return;
  state.jobs.push({ id: randomUUID(), tenant_id, type, resource_id, due_at, key, revision, status: 'pending', attempts: 0, last_error: null });
};
const busy = (state, tenant_id, start, end, except_id = null) => state.appointments.some((item) => item.tenant_id === tenant_id && item.status === 'confirmed' && item.id !== except_id && new Date(item.starts_at) < end && new Date(item.ends_at) > start);

export function create_operations_service(store, { clock = () => new Date() } = {}) {
  function available_slots(state, tenant_id, service_id) {
    const org = business(state, tenant_id);
    const service = org.services.find((item) => item.id === service_id) ?? fail(404, 'Servicio no encontrado.');
    const slots = [];
    const now = clock();
    for (let day = 1; day <= 14; day += 1) {
      const date = new Date(now); date.setUTCDate(date.getUTCDate() + day);
      if ([0, 6].includes(date.getUTCDay())) continue;
      for (const hour of [13, 15, 17]) {
        const start = new Date(date); start.setUTCHours(hour, 0, 0, 0);
        const end = new Date(start.getTime() + service.duration_minutes * 60000);
        if (!busy(state, tenant_id, start, end)) slots.push({ starts_at: start.toISOString(), ends_at: end.toISOString(), service_id });
      }
    }
    return slots;
  }
  function book(draft, tenant_id, input, except_id = null) {
    const org = business(draft, tenant_id);
    scoped(draft.contacts, tenant_id, input.contact_id);
    if (!available_slots(draft, tenant_id, input.service_id).some((slot) => slot.starts_at === input.starts_at)) fail(409, 'Ese horario ya no está disponible.');
    const service = org.services.find((item) => item.id === input.service_id);
    const now = clock();
    const start = new Date(input.starts_at);
    const end = new Date(start.getTime() + service.duration_minutes * 60000);
    if (busy(draft, tenant_id, start, end, except_id)) fail(409, 'La cita coincide con otra reserva.');
    const appointment = { id: randomUUID(), tenant_id, contact_id: input.contact_id, service_id: input.service_id, starts_at: start.toISOString(), ends_at: end.toISOString(), status: 'confirmed', request_key: input.request_key, price_cents: service.price_cents, currency: service.currency, created_at: now.toISOString() };
    draft.appointments.push(appointment);
    add_job(draft, tenant_id, 'confirmation', appointment.id, now.toISOString(), `confirmation:${appointment.id}`);
    const reminder = new Date(Math.max(now.getTime(), start.getTime() - 86400000));
    add_job(draft, tenant_id, 'reminder', appointment.id, reminder.toISOString(), `reminder:${appointment.id}`);
    audit(draft, tenant_id, 'appointment.confirmed', appointment.id, now);
    return appointment;
  }
  return {
    snapshot(tenant_id) {
      const state = store.read();
      const org = business(state, tenant_id);
      const own = (key) => state[key].filter((item) => item.tenant_id === tenant_id);
      return { mode: 'local_sandbox', assistant_mode: 'deterministic', catalogue_version: CATALOG_VERSION, departments: DEPARTMENTS, plans: Object.values(OPERATIONS_PLANS), business: org, contacts: own('contacts'), appointments: own('appointments'), contents: own('contents'), jobs: own('jobs'), deliveries: own('deliveries'), audit: own('audit').slice(-100).reverse(), payments: own('payments'), messages: own('messages').slice(-100), usage: quota(state, tenant_id, clock()), metrics: { leads: own('contacts').length, bookings: own('appointments').filter((item) => item.status === 'confirmed').length, content_pending: own('contents').filter((item) => ['draft', 'approved'].includes(item.status)).length, escalations: own('messages').filter((item) => item.escalated).length, simulated_revenue_cents: own('payments').reduce((sum, item) => sum + item.amount_cents, 0) } };
    },
    slots: (tenant_id, service_id) => available_slots(store.read(), tenant_id, service_id),
    configure(tenant_id, raw) {
      const config = business_config_schema.parse(raw);
      return store.transact((draft) => { const org = business(draft, tenant_id); org.config = config; audit(draft, tenant_id, 'configuration.updated', tenant_id, clock()); return org; });
    },
    contact(tenant_id, raw) {
      const input = contact_schema.parse(raw);
      return store.transact((draft) => {
        business(draft, tenant_id);
        let record = draft.contacts.find((item) => item.tenant_id === tenant_id && item.email === input.email);
        if (!record) { record = { id: randomUUID(), tenant_id, ...input, stage: 'identified', created_at: clock().toISOString() }; draft.contacts.push(record); }
        else { record.name = input.name; record.followup_consent = input.followup_consent; }
        audit(draft, tenant_id, 'contact.saved', record.id, clock());
        if (record.followup_consent) add_job(draft, tenant_id, 'followup', record.id, new Date(clock().getTime() + 86400000).toISOString(), `followup:${record.id}`);
        return record;
      });
    },
    message(tenant_id, raw) {
      const input = message_schema.parse(raw);
      return store.transact((draft) => {
        const org = business(draft, tenant_id);
        scoped(draft.contacts, tenant_id, input.contact_id);
        const duplicate = draft.messages.find((item) => item.tenant_id === tenant_id && item.request_key === input.request_key);
        if (duplicate) { if (duplicate.text !== input.text || duplicate.contact_id !== input.contact_id) fail(409, 'Clave de petición reutilizada con otros datos.'); return duplicate; }
        const usage = quota(draft, tenant_id, clock());
        const sensitive = /suicid|autoles|diagn[oó]st|medicaci[oó]n|crisis|violencia|urgente/i.test(input.text);
        const capped = usage.responses >= OPERATIONS_PLANS[org.plan].responses;
        const escalated = sensitive || org.paused || capped;
        let reply;
        if (sensitive) reply = 'Esta consulta necesita atención humana. El asistente gestiona información y agenda; no puede dar atención clínica. En una emergencia, contacta con los servicios de emergencia de tu país. La solicitud queda pendiente de revisión; este laboratorio no envía avisos externos.';
        else if (org.paused) reply = 'La atención automática está pausada. Tu mensaje queda pendiente de revisión humana.';
        else if (capped) reply = 'Se ha alcanzado el límite del plan. Tu solicitud queda pendiente de atención humana.';
        else if (/precio|cuesta|tarifa|plan/i.test(input.text)) reply = tenant_id === 'diginode' ? Object.values(OPERATIONS_PLANS).map((plan) => `${plan.name}: ${plan.monthly_cents / 100} EUR/mes + ${plan.setup_cents / 100} EUR de instalación.`).join(' ') + ' Puedes probar una asesoría gratuita.' : org.services.map((item) => `${item.name}: ${item.price_cents / 100} ${item.currency}, ${item.duration_minutes} minutos.`).join(' ');
        else if (/agenda|cita|reserv|horario/i.test(input.text)) reply = 'Puedes elegir uno de los huecos disponibles en la agenda de prueba. La cita solo está confirmada después de completar la reserva.';
        else reply = org.config.faq[0]?.answer ?? `Hola, soy ${org.config.assistant_name}, el asistente de ${org.config.name}. Puedo informarte sobre servicios y ayudarte con una reserva.`;
        if (!escalated) usage.responses += 1;
        const message = { id: randomUUID(), tenant_id, contact_id: input.contact_id, request_key: input.request_key, text: input.text, reply, escalated, pending_human: escalated, created_at: clock().toISOString() };
        draft.messages.push(message); audit(draft, tenant_id, escalated ? 'reception.escalated' : 'reception.responded', message.id, clock());
        return message;
      });
    },
    pause(tenant_id, paused) {
      if (typeof paused !== 'boolean') fail(400, 'Estado de pausa inválido.');
      return store.transact((draft) => { const org = business(draft, tenant_id); org.paused = paused; audit(draft, tenant_id, paused ? 'assistant.paused' : 'assistant.resumed', tenant_id, clock()); return org; });
    },
    book(tenant_id, raw) {
      const input = booking_schema.parse(raw);
      return store.transact((draft) => {
        business(draft, tenant_id); scoped(draft.contacts, tenant_id, input.contact_id);
        const duplicate = draft.appointments.find((item) => item.tenant_id === tenant_id && item.request_key === input.request_key);
        if (duplicate) { if (duplicate.contact_id !== input.contact_id || duplicate.starts_at !== input.starts_at || duplicate.service_id !== input.service_id) fail(409, 'Clave de petición reutilizada con otros datos.'); return duplicate; }
        return book(draft, tenant_id, input);
      });
    },
    cancel(tenant_id, id) {
      return store.transact((draft) => {
        const appointment = scoped(draft.appointments, tenant_id, id);
        if (appointment.status === 'cancelled') return appointment;
        appointment.status = 'cancelled';
        for (const job of draft.jobs) if (job.tenant_id === tenant_id && job.resource_id === id && job.status === 'pending') job.status = 'cancelled';
        add_job(draft, tenant_id, 'cancellation', id, clock().toISOString(), `cancellation:${id}`);
        audit(draft, tenant_id, 'appointment.cancelled', id, clock()); return appointment;
      });
    },
    reschedule(tenant_id, id, raw) {
      const input = booking_schema.parse(raw);
      return store.transact((draft) => {
        const old = scoped(draft.appointments, tenant_id, id);
        if (old.status !== 'confirmed') fail(409, 'La cita ya no está confirmada.');
        if (old.contact_id !== input.contact_id || old.service_id !== input.service_id) fail(400, 'La nueva reserva debe conservar contacto y servicio.');
        if (old.starts_at === input.starts_at) return old;
        if (draft.appointments.some((item) => item.tenant_id === tenant_id && item.request_key === input.request_key)) fail(409, 'La clave de reserva ya está en uso.');
        const replacement = book(draft, tenant_id, input, id);
        old.status = 'cancelled';
        for (const job of draft.jobs) if (job.tenant_id === tenant_id && job.resource_id === id && job.status === 'pending') job.status = 'cancelled';
        audit(draft, tenant_id, 'appointment.rescheduled', replacement.id, clock()); return replacement;
      });
    },
    generate_content(tenant_id, raw) {
      const input = content_input_schema.parse(raw);
      return store.transact((draft) => {
        const org = business(draft, tenant_id); const usage = quota(draft, tenant_id, clock());
        if (usage.content + 3 > OPERATIONS_PLANS[org.plan].content) fail(429, 'El plan no tiene capacidad para otras tres piezas este mes.');
        const source = input.source.replace(/\s+/g, ' ').slice(0, 500);
        const templates = [
          { format: 'Publicación', copy: `${source}\n\nEn ${org.config.name} puedes consultar nuestros servicios y disponibilidad. Escríbenos para conocer más.` },
          { format: 'Carrusel', copy: `1. Una idea que queremos compartir\n${source}\n\n2. Qué puedes hacer ahora\nRevisa nuestra información y reserva si el servicio encaja contigo.\n\n3. Hablemos\n${org.config.name}: consulta nuestros horarios y tarifas.` },
          { format: 'Guion de vídeo', copy: `Inicio: «Quiero compartir una idea contigo».\nDesarrollo: ${source}\nCierre: «Si quieres conocer ${org.config.name}, puedes escribirnos o consultar la agenda».` },
        ];
        const items = templates.map((item) => ({ id: randomUUID(), tenant_id, ...item, source: input.source, channel: input.channel, status: 'draft', revision: 1, approved_revision: null, scheduled_at: null, created_at: clock().toISOString() }));
        draft.contents.push(...items); usage.content += items.length;
        for (const item of items) audit(draft, tenant_id, 'content.drafted', item.id, clock()); return items;
      });
    },
    edit_content(tenant_id, id, raw) {
      const input = content_edit_schema.parse(raw);
      return store.transact((draft) => {
        const item = scoped(draft.contents, tenant_id, id);
        if (item.status === 'sandbox_delivered') fail(409, 'Una pieza entregada no puede editarse.');
        if (item.revision !== input.revision) fail(409, 'La pieza cambió; actualiza antes de editar.');
        item.copy = input.copy; item.revision += 1; item.status = 'draft'; item.approved_revision = null; item.scheduled_at = null;
        for (const job of draft.jobs) if (job.tenant_id === tenant_id && job.resource_id === id && job.status === 'pending') job.status = 'cancelled';
        audit(draft, tenant_id, 'content.edited', id, clock()); return item;
      });
    },
    approve_content(tenant_id, id, revision) {
      return store.transact((draft) => {
        const item = scoped(draft.contents, tenant_id, id);
        if (item.status !== 'draft' || item.revision !== revision) fail(409, 'Solo se puede aprobar el borrador actual.');
        item.status = 'approved'; item.approved_revision = revision;
        audit(draft, tenant_id, 'content.approved', id, clock()); return item;
      });
    },
    schedule_content(tenant_id, id, raw) {
      const input = schedule_schema.parse(raw);
      return store.transact((draft) => {
        const item = scoped(draft.contents, tenant_id, id);
        if (item.status !== 'approved' || item.approved_revision !== item.revision || item.revision !== input.revision) fail(409, 'Aprueba la versión actual antes de programar.');
        if (new Date(input.scheduled_at) < clock()) fail(400, 'La fecha de publicación debe ser futura.');
        item.status = 'scheduled'; item.scheduled_at = input.scheduled_at;
        add_job(draft, tenant_id, 'publication', id, input.scheduled_at, `publication:${id}:${item.revision}`, item.revision);
        audit(draft, tenant_id, 'content.scheduled', id, clock()); return item;
      });
    },
    checkout(tenant_id, plan_slug) {
      if (!OPERATIONS_PLANS[plan_slug]) fail(400, 'Plan inválido.');
      return store.transact((draft) => {
        const org = business(draft, tenant_id);
        if (org.subscription === 'sandbox_paid') return org;
        const plan = OPERATIONS_PLANS[plan_slug]; org.plan = plan_slug; org.subscription = 'sandbox_paid';
        draft.payments.push({ id: randomUUID(), tenant_id, provider: 'sandbox', type: 'activation', currency: plan.currency, amount_cents: plan.monthly_cents + plan.setup_cents, monthly_cents: plan.monthly_cents, setup_cents: plan.setup_cents, created_at: clock().toISOString() });
        audit(draft, tenant_id, 'subscription.sandbox_paid', tenant_id, clock()); return org;
      });
    },
    onboard(tenant_id, raw) {
      const input = onboarding_schema.parse(raw);
      return store.transact((draft) => {
        const org = business(draft, tenant_id);
        if (org.subscription !== 'sandbox_paid') fail(409, 'Primero completa el pago simulado.');
        org.onboarding = input; org.config.name = input.business_name; org.config.owner_email = input.owner_email; org.status = 'testing';
        audit(draft, tenant_id, 'onboarding.completed', tenant_id, clock()); return org;
      });
    },
    activate(tenant_id) {
      return store.transact((draft) => {
        const org = business(draft, tenant_id);
        if (!org.onboarding || org.subscription !== 'sandbox_paid') fail(409, 'Completa incorporación y pago antes de activar.');
        org.status = 'sandbox_live'; audit(draft, tenant_id, 'business.sandbox_activated', tenant_id, clock()); return org;
      });
    },
    process_jobs(tenant_id) {
      return store.transact((draft) => {
        business(draft, tenant_id); const now = clock(); let delivered = 0;
        for (const job of draft.jobs.filter((item) => item.tenant_id === tenant_id && item.status === 'pending' && new Date(item.due_at) <= now)) {
          job.attempts += 1;
          try {
            let payload;
            if (job.type === 'publication') {
              const item = scoped(draft.contents, tenant_id, job.resource_id);
              if (item.status !== 'scheduled' || item.revision !== job.revision || item.approved_revision !== job.revision) { job.status = 'cancelled'; continue; }
              payload = { channel: item.channel, copy: item.copy }; item.status = 'sandbox_delivered';
            } else if (job.type === 'followup') {
              const contact = scoped(draft.contacts, tenant_id, job.resource_id);
              if (!contact.followup_consent || draft.appointments.some((item) => item.tenant_id === tenant_id && item.contact_id === contact.id && item.status === 'confirmed')) { job.status = 'cancelled'; continue; }
              payload = { email: contact.email, text: '¿Quieres consultar nuestros servicios o reservar una cita?' };
            } else {
              const appointment = scoped(draft.appointments, tenant_id, job.resource_id);
              if (job.type !== 'cancellation' && appointment.status !== 'confirmed') { job.status = 'cancelled'; continue; }
              const contact = scoped(draft.contacts, tenant_id, appointment.contact_id);
              payload = { email: contact.email, appointment_id: appointment.id, starts_at: appointment.starts_at, kind: job.type };
            }
            if (!draft.deliveries.some((item) => item.tenant_id === tenant_id && item.key === job.key)) {
              draft.deliveries.push({ id: randomUUID(), tenant_id, key: job.key, provider: 'sandbox', payload, created_at: now.toISOString() }); delivered += 1;
            }
            job.status = 'sandbox_delivered'; job.last_error = null; audit(draft, tenant_id, 'job.sandbox_delivered', job.id, now);
          } catch { job.last_error = 'No se ha podido preparar la entrega de prueba.'; job.status = job.attempts >= 3 ? 'failed' : 'pending'; job.due_at = new Date(now.getTime() + 60000).toISOString(); }
        }
        return { delivered };
      });
    },
    export(tenant_id) {
      const state = store.read(); business(state, tenant_id);
      return { version: 1, mode: 'local_sandbox', exported_at: clock().toISOString(), business: business(state, tenant_id), ...Object.fromEntries(['contacts', 'appointments', 'contents', 'payments', 'deliveries', 'audit', 'messages'].map((key) => [key, state[key].filter((item) => item.tenant_id === tenant_id)])) };
    },
  };
}
