import { describe, it, expect } from 'vitest';
import {
  PLANS, CLINICA_EMPLOYEES, EMPLOYEE_NAMES, LEGACY_PLAN_INFO, public_plan,
} from '../src/config/plans.js';
import Client from '../src/models/client_model.js';

// Modelo comercial vigente (decisión 2026-08-14): un solo producto en venta.
// Los planes antiguos ya no se comercializan; solo sobreviven en
// LEGACY_PLAN_INFO para que el portal siga renderizando a quien los tenga.
describe('config/plans', () => {
  it('Clínica Digital es el único plan a la venta', () => {
    expect(Object.keys(PLANS)).toEqual(['clinica']);
  });

  it('el flagship son 150€/mes sin setup y con 3 empleados', () => {
    expect(PLANS.clinica.role).toBe('flagship');
    expect(PLANS.clinica.monthly).toBe(150);
    expect(PLANS.clinica.setup).toBe(0);
    expect(PLANS.clinica.employees_included).toBe(3);
  });

  it('los empleados incluidos coinciden en número con lo que promete el plan', () => {
    expect(CLINICA_EMPLOYEES).toHaveLength(PLANS.clinica.employees_included);
  });

  it('cada empleado incluido es un slug que el modelo Client acepta', () => {
    const valid = Client.schema.path('active_employees').caster.enumValues;
    for (const slug of CLINICA_EMPLOYEES) expect(valid).toContain(slug);
  });

  it('cada empleado incluido tiene nombre para el portal y los correos', () => {
    for (const slug of CLINICA_EMPLOYEES) expect(EMPLOYEE_NAMES[slug]).toBeTruthy();
  });

  it('los planes heredados siguen teniendo nombre y precio para el portal', () => {
    for (const info of Object.values(LEGACY_PLAN_INFO)) {
      expect(info.name).toBeTruthy();
      expect(typeof info.monthly).toBe('number');
    }
  });

  it('los slugs heredados siguen siendo válidos para el campo plan del Client', () => {
    const valid = Client.schema.path('plan').enumValues;
    for (const slug of Object.keys(LEGACY_PLAN_INFO)) expect(valid).toContain(slug);
    expect(valid).toContain('clinica');
  });

  it('public_plan expone la forma esperada', () => {
    const p = public_plan(PLANS.clinica);
    expect(p).toMatchObject({ slug: 'clinica', monthly: 150, role: 'flagship' });
    expect(p).toHaveProperty('setup');
    expect(p).toHaveProperty('employees_included');
  });
});
