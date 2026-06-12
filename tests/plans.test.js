import { describe, it, expect } from 'vitest';
import { PLANS, AI_PLAN_SLUGS, public_plan } from '../src/config/plans.js';

describe('config/plans', () => {
  it('flagship is Plan Entrepreneur at 300€ flat', () => {
    expect(PLANS.entrepreneur.role).toBe('flagship');
    expect(PLANS.entrepreneur.monthly).toBe(300);
    expect(PLANS.entrepreneur.setup).toBe(0);
  });

  it('upsell is Clínica 500, downsell is Individual 180', () => {
    expect(PLANS.clinica.role).toBe('upsell');
    expect(PLANS.clinica.monthly).toBe(500);
    expect(PLANS.individual.role).toBe('downsell');
    expect(PLANS.individual.monthly).toBe(180);
  });

  it('AI plan slugs map to existing plans', () => {
    for (const slug of AI_PLAN_SLUGS) expect(PLANS[slug]).toBeDefined();
  });

  it('public_plan exposes the expected shape', () => {
    const p = public_plan(PLANS.entrepreneur);
    expect(p).toMatchObject({ slug: 'entrepreneur', monthly: 300, role: 'flagship' });
    expect(p).toHaveProperty('setup');
  });
});
