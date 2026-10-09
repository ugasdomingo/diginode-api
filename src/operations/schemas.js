import { z } from 'zod';

const timezone = z.string().max(80).refine((value) => {
  try { new Intl.DateTimeFormat('es', { timeZone: value }); return true; } catch { return false; }
}, 'Zona horaria inválida');
const email = z.string().email().max(200).transform((value) => value.toLowerCase());
export const business_config_schema = z.object({
  name: z.string().trim().min(2).max(100),
  country: z.string().regex(/^[A-Z]{2}$/),
  timezone,
  assistant_name: z.string().trim().min(2).max(40),
  tone: z.string().trim().min(3).max(600),
  owner_email: email,
  cancellation_hours: z.number().int().min(0).max(168),
  faq: z.array(z.object({ question: z.string().min(3).max(200), answer: z.string().min(3).max(1000) }).strict()).max(30),
}).strict();
export const contact_schema = z.object({ name: z.string().trim().min(2).max(100), email, followup_consent: z.boolean().default(false) }).strict();
export const message_schema = z.object({ contact_id: z.string().uuid(), text: z.string().trim().min(1).max(1500), request_key: z.string().uuid() }).strict();
export const booking_schema = z.object({ contact_id: z.string().uuid(), service_id: z.string().min(1).max(60), starts_at: z.string().datetime(), request_key: z.string().uuid() }).strict();
export const content_input_schema = z.object({ source: z.string().trim().min(20).max(5000), channel: z.enum(['instagram', 'linkedin', 'facebook']) }).strict();
export const content_edit_schema = z.object({ copy: z.string().trim().min(20).max(3000), revision: z.number().int().positive() }).strict();
export const schedule_schema = z.object({ revision: z.number().int().positive(), scheduled_at: z.string().datetime() }).strict();
export const onboarding_schema = z.object({ business_name: z.string().trim().min(2).max(100), owner_email: email, materials_received: z.literal(true), schedule_reviewed: z.literal(true), responses_reviewed: z.literal(true) }).strict();
