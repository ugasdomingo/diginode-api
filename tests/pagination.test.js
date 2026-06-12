import { describe, it, expect } from 'vitest';
import { clamp_pagination } from '../src/utils/pagination.js';

describe('clamp_pagination', () => {
  it('caps limit at max_limit (100)', () => {
    expect(clamp_pagination({ page: '2', limit: '999999' })).toEqual({ page: 2, limit: 100, skip: 100 });
  });

  it('applies defaults for missing params', () => {
    expect(clamp_pagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('floors page and limit to their minimums', () => {
    expect(clamp_pagination({ page: '-5', limit: '0' })).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('honors a custom default_limit', () => {
    expect(clamp_pagination({}, { default_limit: 30 }).limit).toBe(30);
  });
});
