import { z } from 'zod';
import { SERVICE_IDS } from '../config/services.js';

export const lead_schema = z
  .object({
    request_id: z.uuid(),
    name: z.string().trim().min(2).max(100),
    company: z.string().trim().min(2).max(160),
    email: z.email().trim().toLowerCase().max(254),
    service_interest: z.enum(SERVICE_IDS),
    requested_scale: z.enum(['micro', 'sme', 'pending']).default('pending'),
    website: z
      .union([
        z.literal(''),
        z
          .url()
          .max(500)
          .refine(
            (value) => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol),
            'Usa una URL HTTP o HTTPS'
          ),
      ])
      .optional()
      .default(''),
    goal: z.string().trim().min(10).max(2000),
    budget_range: z
      .enum([
        'pending',
        'monthly_under_1500',
        'monthly_1500_3000',
        'monthly_over_3000',
        'project_under_5000',
        'project_5000_10000',
        'project_over_10000',
      ])
      .default('pending'),
    landing_path: z.enum(['/', '/webs-y-aplicaciones', '/clinica-digital']).default('/'),
    privacy_version: z.string().max(20),
    privacy_acknowledged: z.literal(true),
    attribution: z
      .object({
        channel: z.enum(['direct', 'google', 'instagram', 'facebook', 'referral', 'other']),
        campaign: z.enum(['none', 'brand', 'web', 'clinic']),
      })
      .optional(),
    honeypot: z.string().max(200).optional().default(''),
  })
  .superRefine((value, ctx) => {
    if (value.service_interest !== 'brand_management' && value.requested_scale !== 'pending')
      ctx.addIssue({
        code: 'custom',
        path: ['requested_scale'],
        message: 'La escala solo corresponde a gestión',
      });
    if (value.budget_range.startsWith('monthly_') && value.service_interest !== 'brand_management')
      ctx.addIssue({
        code: 'custom',
        path: ['budget_range'],
        message: 'Presupuesto mensual solo para gestión',
      });
    if (value.budget_range.startsWith('project_') && value.service_interest !== 'web_project')
      ctx.addIssue({
        code: 'custom',
        path: ['budget_range'],
        message: 'Inversión de proyecto solo para desarrollo',
      });
  });
