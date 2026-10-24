import { z } from 'zod';
export const demo_contact = z
  .string()
  .regex(/^demo-[a-zA-Z0-9-]{8,100}$/, 'Identificador de demo no válido');
export const demo_message_schema = z.object({
  contact_id: demo_contact,
  platform: z.literal('website').optional().default('website'),
  message: z.string().trim().min(1).max(2000),
  sender_name: z.string().trim().max(100).optional(),
  context: z.enum(['agency', 'clinic', 'web']).optional().default('clinic'),
  supports_confirmation: z.boolean().optional().default(false),
});
export const demo_confirm_schema = z.object({ contact_id: demo_contact, action_id: z.uuid() });
