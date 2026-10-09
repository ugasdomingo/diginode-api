import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create_local_store } from '../src/operations/local_store.js';
import { create_operations_service } from '../src/operations/service.js';
import { create_lab_app } from '../src/operations/local_app.js';

let store; let service; let now;
const source = 'Esta semana mostramos cómo una consulta puede gestionar su agenda y dedicar más tiempo a sus clientes.';
const contact = (tenant = 'diginode') => service.contact(tenant, { name: 'Persona de prueba', email: 'persona@ejemplo.test', followup_consent: true });
const reserve = async (slot = 0) => {
  const lead = await contact();
  return service.book('diginode', { contact_id: lead.id, service_id: 'asesoria', starts_at: service.slots('diginode', 'asesoria')[slot].starts_at, request_key: randomUUID() });
};
beforeEach(async () => { now = new Date('2026-10-09T10:00:00Z'); store = await create_local_store(); service = create_operations_service(store, { clock: () => new Date(now) }); });
afterEach(async () => { await store.close(); });

describe('núcleo operativo local', () => {
  it('aísla contactos, conversaciones y exportaciones por negocio', async () => {
    const lead = await contact();
    expect(service.snapshot('consulta-demo').contacts).toEqual([]);
    await expect(service.message('consulta-demo', { contact_id: lead.id, text: 'Hola', request_key: randomUUID() })).rejects.toMatchObject({ status: 404 });
    expect(service.export('consulta-demo').contacts).toEqual([]);
    expect(() => service.snapshot('inexistente')).toThrow('Negocio no encontrado');
  });
  it('rechaza un tenant inyectado en el formulario', async () => {
    expect(() => service.contact('diginode', { name: 'Ejemplo', email: 'a@b.test', tenant_id: 'consulta-demo' })).toThrow();
  });
  it('valida zona horaria sin modificar una configuración válida', async () => {
    const config = service.snapshot('diginode').business.config;
    expect(() => service.configure('diginode', { ...config, timezone: 'Zona/Falsa' })).toThrow();
    expect(service.snapshot('diginode').business.config).toEqual(config);
  });
  it('usa los precios del catálogo y deriva al alcanzar la cuota', async () => {
    const lead = await contact();
    const input = { contact_id: lead.id, text: '¿Cuánto cuesta?', request_key: randomUUID() };
    expect((await service.message('diginode', input)).reply).toContain('149 EUR/mes');
    await store.transact((draft) => { draft.usage[0].responses = 1000; return null; });
    expect((await service.message('diginode', { ...input, request_key: randomUUID() })).pending_human).toBe(true);
    expect(service.snapshot('diginode').usage.responses).toBe(1000);
  });
  it('deriva preguntas clínicas y respeta la pausa humana', async () => {
    const lead = await contact(); const input = { contact_id: lead.id, text: 'Necesito un diagnóstico', request_key: randomUUID() };
    const result = await service.message('diginode', input);
    expect(result.pending_human).toBe(true); expect(result.reply).not.toContain('he avisado');
    await service.pause('diginode', true);
    expect((await service.message('diginode', { ...input, text: 'Hola', request_key: randomUUID() })).reply).toContain('pausada');
  });
  it('no duplica conversación ni uso ante reintentos', async () => {
    const lead = await contact(); const input = { contact_id: lead.id, text: 'Hola', request_key: randomUUID() };
    const first = await service.message('diginode', input);
    expect((await service.message('diginode', input)).id).toBe(first.id);
    expect(service.snapshot('diginode').usage.responses).toBe(1);
    await expect(service.message('diginode', { ...input, text: 'Otros datos' })).rejects.toMatchObject({ status: 409 });
  });
  it('evita dos reservas concurrentes en el mismo hueco', async () => {
    const lead = await contact(); const starts_at = service.slots('diginode', 'asesoria')[0].starts_at;
    const input = { contact_id: lead.id, service_id: 'asesoria', starts_at };
    const results = await Promise.allSettled([service.book('diginode', { ...input, request_key: randomUUID() }), service.book('diginode', { ...input, request_key: randomUUID() })]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(service.snapshot('diginode').appointments).toHaveLength(1);
  });
  it('reservas repetidas no recrean recordatorios', async () => {
    const lead = await contact(); const input = { contact_id: lead.id, service_id: 'asesoria', starts_at: service.slots('diginode', 'asesoria')[0].starts_at, request_key: randomUUID() };
    const first = await service.book('diginode', input);
    expect((await service.book('diginode', input)).id).toBe(first.id);
    expect(service.snapshot('diginode').jobs.filter((job) => job.type === 'confirmation')).toHaveLength(1);
  });
  it('cambiar una reserva cancela los trabajos antiguos', async () => {
    const slots = service.slots('diginode', 'asesoria'); const first = await reserve();
    const second = await service.reschedule('diginode', first.id, { contact_id: first.contact_id, service_id: 'asesoria', starts_at: slots[1].starts_at, request_key: randomUUID() });
    expect(second.id).not.toBe(first.id);
    expect(service.snapshot('diginode').jobs.filter((job) => job.resource_id === first.id).every((job) => job.status === 'cancelled')).toBe(true);
  });
  it('un cambio fallido no cancela la cita original', async () => {
    const first = await reserve(); const second = await reserve();
    await expect(service.reschedule('diginode', first.id, { contact_id: first.contact_id, service_id: 'asesoria', starts_at: second.starts_at, request_key: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(service.snapshot('diginode').appointments.find((item) => item.id === first.id).status).toBe('confirmed');
  });
  it('cancelar detiene recordatorios y no permite acceso de otra cuenta', async () => {
    const first = await reserve();
    await expect(service.cancel('consulta-demo', first.id)).rejects.toMatchObject({ status: 404 });
    await service.cancel('diginode', first.id); now = new Date(first.starts_at); await service.process_jobs('diginode');
    const deliveredKinds = service.snapshot('diginode').deliveries.map((item) => item.payload.kind).filter(Boolean);
    expect(deliveredKinds).toEqual(['cancellation']);
  });
  it('respeta capacidad de contenido', async () => {
    await service.generate_content('consulta-demo', { source, channel: 'instagram' });
    await expect(service.generate_content('consulta-demo', { source, channel: 'instagram' })).rejects.toMatchObject({ status: 429 });
    expect(service.snapshot('consulta-demo').contents).toHaveLength(3);
  });
  it('solo programa la versión aprobada y entrega una vez', async () => {
    const [item] = await service.generate_content('diginode', { source, channel: 'linkedin' });
    const scheduled_at = new Date(now.getTime() + 1000).toISOString();
    await expect(service.schedule_content('diginode', item.id, { revision: 1, scheduled_at })).rejects.toMatchObject({ status: 409 });
    await service.approve_content('diginode', item.id, 1); await service.schedule_content('diginode', item.id, { revision: 1, scheduled_at });
    now = new Date(scheduled_at); await Promise.all([service.process_jobs('diginode'), service.process_jobs('diginode')]);
    expect(service.snapshot('diginode').deliveries).toHaveLength(1);
    expect(service.snapshot('diginode').contents[0].status).toBe('sandbox_delivered');
  });
  it('editar invalida la aprobación y cancela la publicación anterior', async () => {
    const [item] = await service.generate_content('diginode', { source, channel: 'instagram' });
    await service.approve_content('diginode', item.id, 1); await service.schedule_content('diginode', item.id, { revision: 1, scheduled_at: new Date(now.getTime() + 1000).toISOString() });
    await service.edit_content('diginode', item.id, { revision: 1, copy: `${source} Revisado.` });
    now = new Date(now.getTime() + 2000); await service.process_jobs('diginode');
    expect(service.snapshot('diginode').deliveries).toHaveLength(0);
    await expect(service.approve_content('diginode', item.id, 1)).rejects.toMatchObject({ status: 409 });
  });
  it('respeta retirada de consentimiento', async () => {
    const lead = await contact(); await service.contact('diginode', { name: lead.name, email: lead.email, followup_consent: false });
    now = new Date(now.getTime() + 172800000); await service.process_jobs('diginode');
    expect(service.snapshot('diginode').deliveries).toHaveLength(0);
  });
  it('los trabajos fallidos se reintentan hasta quedar pendientes de revisión', async () => {
    await store.transact((draft) => {
      draft.jobs.push({ id: randomUUID(), tenant_id: 'diginode', type: 'reminder', resource_id: randomUUID(), due_at: now.toISOString(), key: 'broken-job', status: 'pending', attempts: 0 });
      return null;
    });
    for (let attempt = 0; attempt < 3; attempt += 1) { await service.process_jobs('diginode'); now = new Date(now.getTime() + 61000); }
    expect(service.snapshot('diginode').jobs[0]).toMatchObject({ status: 'failed', attempts: 3 });
    expect(service.snapshot('diginode').deliveries).toHaveLength(0);
    expect(service.snapshot('consulta-demo').jobs).toHaveLength(0);
  });
  it('renueva la cuota al cambiar de mes sin borrar el historial', async () => {
    const lead = await contact();
    await service.message('diginode', { contact_id: lead.id, text: 'Hola', request_key: randomUUID() });
    now = new Date('2026-11-01T12:00:00Z');
    expect(service.snapshot('diginode').usage.responses).toBe(0);
    expect(service.snapshot('diginode').messages).toHaveLength(1);
  });
  it('activa solo tras pago simulado e incorporación completos', async () => {
    await expect(service.activate('diginode')).rejects.toMatchObject({ status: 409 });
    await service.checkout('diginode', 'consulta'); await service.checkout('diginode', 'consulta');
    expect(service.snapshot('diginode').payments).toHaveLength(1);
    expect(service.snapshot('diginode').payments[0].amount_cents).toBe(29800);
    await service.onboard('diginode', { business_name: 'Diginode', owner_email: 'uno@ejemplo.test', materials_received: true, schedule_reviewed: true, responses_reviewed: true });
    expect((await service.activate('diginode')).status).toBe('sandbox_live');
  });
  it('una transacción fallida no modifica el estado', async () => {
    const before = store.read();
    await expect(store.transact((draft) => { draft.contacts.push({ secret: true }); throw new Error('Fallo provocado'); })).rejects.toThrow();
    expect(store.read()).toEqual(before);
  });
  it('persiste y continúa trabajos después de un reinicio', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'diginode-lab-test-')); const filename = join(directory, 'state.json'); let disk;
    try {
      disk = await create_local_store(filename); let runner = create_operations_service(disk, { clock: () => now });
      const lead = await runner.contact('diginode', { name: 'Persona de prueba', email: 'a@b.test', followup_consent: true });
      await runner.book('diginode', { contact_id: lead.id, service_id: 'asesoria', starts_at: runner.slots('diginode', 'asesoria')[0].starts_at, request_key: randomUUID() });
      await expect(create_local_store(filename)).rejects.toThrow('otro proceso');
      await disk.close(); disk = await create_local_store(filename); runner = create_operations_service(disk, { clock: () => now });
      await runner.process_jobs('diginode'); await runner.process_jobs('diginode');
      expect(runner.snapshot('diginode').deliveries).toHaveLength(1);
      expect(runner.snapshot('consulta-demo').deliveries).toHaveLength(0);
    } finally { if (disk) await disk.close(); await rm(directory, { recursive: true, force: true }); }
  });
});

describe('frontera HTTP local', () => {
  it('bloquea origen ajeno, sesión ausente y tenant falsificado', async () => {
    const server = create_lab_app(service).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/lab`;
    try {
      const foreign = await fetch(`${base}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ejemplo.test' }, body: JSON.stringify({ business_id: 'diginode' }) }); expect(foreign.status).toBe(403);
      expect((await fetch(`${base}/snapshot`)).status).toBe(401);
      const session = await (await fetch(`${base}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: 'consulta-demo' }) })).json();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.token}` };
      const invalid = await fetch(`${base}/contacts`, { method: 'POST', headers, body: JSON.stringify({ name: 'Persona de prueba', email: 'a@b.test', tenant_id: 'diginode' }) }); expect(invalid.status).toBe(400);
      expect(service.snapshot('diginode').contacts).toHaveLength(0);
      expect((await (await fetch(base.replace('/api/lab', '/health'))).json()).integrations).toBe('disabled');
    } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });
});
