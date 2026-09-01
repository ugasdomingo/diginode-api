import { describe, it, expect } from 'vitest';
import { TRAININGS, get_training, public_training, private_training } from '../src/config/trainings.js';

const taller = TRAININGS['ia-para-terapeutas'];

describe('config/trainings', () => {
  it('el taller es gratuito: precio 0 activa la inscripción por formulario', () => {
    expect(taller.price).toBe(0);
    expect(taller.currency).toBe('EUR');
  });

  it('el aforo cuenta con la no-asistencia propia de un taller gratuito', () => {
    expect(taller.capacity).toBe(20);
  });

  it('get_training devuelve null para slugs desconocidos', () => {
    expect(get_training('no-existe')).toBeNull();
    expect(get_training('ia-para-terapeutas')).toBe(taller);
  });

  it('public_training calcula las plazas restantes', () => {
    expect(public_training(taller, { seats_taken: 3 }).seats_left).toBe(17);
    expect(public_training(taller, { seats_taken: 0 }).seats_left).toBe(20);
  });

  it('public_training marca sold_out al llegar al aforo y nunca da plazas negativas', () => {
    const full = public_training(taller, { seats_taken: taller.capacity });
    expect(full.sold_out).toBe(true);
    expect(full.seats_left).toBe(0);

    const over = public_training(taller, { seats_taken: taller.capacity + 5 });
    expect(over.seats_left).toBe(0);
    expect(over.sold_out).toBe(true);
  });

  it('public_training no filtra el enlace de acceso', () => {
    expect(public_training(taller)).not.toHaveProperty('meet_url');
  });

  it('private_training sí incluye el enlace, para compradores autenticados', () => {
    expect(private_training(taller)).toHaveProperty('meet_url');
    expect(private_training(taller).requirements.length).toBeGreaterThan(0);
  });

  it('el aviso del coste de herramientas está presente en la vista pública', () => {
    expect(public_training(taller).tools_cost_note).toContain('25');
  });

  it('la vista pública lleva el público objetivo y los dolores, para que Nora pueda venderlo', () => {
    const p = public_training(taller);
    expect(p.for_who).toBeTruthy();
    expect(p.not_for).toBeTruthy();
    expect(p.solves.length).toBeGreaterThan(0);
  });
});
