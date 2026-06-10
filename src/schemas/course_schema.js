import { z } from 'zod';

// Public waitlist signup — unauthenticated, so bound every field tightly.
export const waitlist_schema = z.object({
  name:  z.string().trim().min(2, 'Nombre demasiado corto').max(100),
  email: z.string().trim().toLowerCase().email('Email no válido').max(254),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{6,20}$/, 'Teléfono no válido'),
});
