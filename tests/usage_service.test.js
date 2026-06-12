import { describe, it, expect } from 'vitest';
import { PLAN_MESSAGE_LIMITS, DEMO_MESSAGE_LIMIT, over_monthly_limit } from '../src/services/usage_service.js';

describe('usage_service limits', () => {
  it('defines the per-plan starting limits', () => {
    expect(PLAN_MESSAGE_LIMITS.entrepreneur).toBe(4000);
    expect(PLAN_MESSAGE_LIMITS.individual).toBe(2000);
    expect(DEMO_MESSAGE_LIMIT).toBe(15);
  });

  it('fails open (no block) for an unknown plan — no DB access', async () => {
    expect(await over_monthly_limit('someid', 'no_such_plan')).toBe(false);
  });

  it('fails open when client_id is missing', async () => {
    expect(await over_monthly_limit(null, 'entrepreneur')).toBe(false);
  });
});
