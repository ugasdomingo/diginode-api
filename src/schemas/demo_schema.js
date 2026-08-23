import { z } from 'zod';

// POST /api/demo/message — public demo of Nora. Bound tightly (unauthenticated).
export const demo_message_schema = z.object({
  contact_id:  z.string().trim().min(1).max(128),
  // Por defecto 'website': la demo de Nora se usa desde la web. Asumir
  // 'whatsapp' hacía que meses de tráfico web se contabilizaran como WhatsApp.
  platform:    z.enum(['whatsapp', 'instagram', 'website']).optional().default('website'),
  message:     z.string().trim().min(1, 'Mensaje vacío').max(2000),
  sender_name: z.string().trim().max(100).optional(),
});
