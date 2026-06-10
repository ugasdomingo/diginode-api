import { z } from 'zod';

// POST /api/demo/message — public demo of Nora. Bound tightly (unauthenticated).
export const demo_message_schema = z.object({
  contact_id:  z.string().trim().min(1).max(128),
  platform:    z.enum(['whatsapp', 'instagram', 'website']).optional().default('whatsapp'),
  message:     z.string().trim().min(1, 'Mensaje vacío').max(2000),
  sender_name: z.string().trim().max(100).optional(),
});
