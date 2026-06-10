import { z } from 'zod';

export const login_schema = z.object({
  email:    z.string().trim().toLowerCase().email('Email no válido').max(254),
  password: z.string().min(1, 'La contraseña es obligatoria').max(128),
});

export const change_password_schema = z.object({
  new_password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
});
