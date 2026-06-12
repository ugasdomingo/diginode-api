import { describe, it, expect, vi } from 'vitest';
import validate_object_id from '../src/middleware/validate_object_id.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('validate_object_id', () => {
  it('rejects a malformed id with 400', () => {
    const res = mockRes();
    const next = vi.fn();
    validate_object_id('client_id')({ params: { client_id: 'abc' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for a valid ObjectId', () => {
    const res = mockRes();
    const next = vi.fn();
    validate_object_id('client_id')({ params: { client_id: '507f1f77bcf86cd799439011' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
