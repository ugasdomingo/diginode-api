import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  API_SCOPES,
  CLIENT_STATUSES,
  CREDENTIAL_PROVIDERS,
  LEAD_SOURCES,
  MEETING_STATUSES,
  PIECE_TYPES,
  PIPELINE_STATUSES,
  REPORT_STATUSES,
} from '../agency/constants.js';

const one_of = (values) =>
  z.string().refine((value) => values.includes(value), { message: 'Valor no permitido' });

const object_id = z.string().regex(/^[a-f\d]{24}$/i, 'Id no válido');

const http_url = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Usa una URL HTTP o HTTPS');

const optional_email = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.email().trim().toLowerCase().max(254).optional()
);

const iso_date = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha no válida');

const link = z
  .object({
    label: z.string().trim().min(1).max(80),
    url: http_url,
  })
  .strict();

const kpi = z
  .object({
    name: z.string().trim().min(1).max(80),
    value: z.union([z.string().max(40), z.number()]).optional(),
    unit: z.string().trim().max(20).optional(),
    period: z.string().trim().max(40).optional(),
  })
  .strict();

const brand = z
  .object({
    name: z.string().trim().max(120).optional(),
    voice: z.string().trim().max(1000).optional(),
    sector: z.string().trim().max(80).optional(),
    city: z.string().trim().max(80).optional(),
    logo_url: http_url.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const create_lead_schema = z
  .object({
    business: z.string().trim().min(1).max(160),
    name: z.string().trim().max(120).optional(),
    email: optional_email,
    phone: z.string().trim().max(40).optional(),
    website: http_url.optional(),
    links: z.array(link).max(10).optional(),
    source: one_of(LEAD_SOURCES).optional(),
    origin_detail: z.string().trim().max(200).optional(),
    pipeline_status: one_of(PIPELINE_STATUSES).optional(),
    service_interest: one_of([
      'brand_management',
      'web_project',
      'digital_clinic',
      'undecided',
    ]).optional(),
    next_action: z.string().trim().max(300).optional(),
    next_action_at: iso_date.optional(),
    internal_notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const patch_lead_schema = create_lead_schema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nada que actualizar',
  });

export const activity_schema = z
  .object({
    type: one_of(ACTIVITY_TYPES),
    summary: z.string().trim().min(1).max(500),
    at: iso_date.optional(),
    next_action: z.string().trim().max(300).optional(),
    next_action_at: iso_date.optional(),
  })
  .strict();

export const create_client_schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().trim().toLowerCase().max(254),
    company: z.string().trim().max(160).optional(),
    country: z.string().trim().max(80).optional(),
    plan: one_of([
      'latam',
      'spain',
      'despacho-digital',
      'entrepreneur',
      'course',
      'bolsa',
      'individual',
      'estudio',
      'clinica',
    ]).optional(),
    status: one_of(CLIENT_STATUSES).optional(),
    service_package: z.string().trim().max(120).optional(),
    account_manager_bot: z.string().trim().max(80).optional(),
    brand: brand.optional(),
    kpis: z.array(kpi).max(30).optional(),
    strategy_links: z.array(link).max(20).optional(),
  })
  .strict();

export const patch_client_schema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().max(160).optional(),
    country: z.string().trim().max(80).optional(),
    status: one_of(CLIENT_STATUSES).optional(),
    service_package: z.string().trim().max(120).optional(),
    account_manager_bot: z.string().trim().max(80).optional(),
    brand: brand.optional(),
    kpis: z.array(kpi).max(30).optional(),
    strategy_links: z.array(link).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nada que actualizar' });

export const create_piece_schema = z
  .object({
    client_id: object_id.optional(),
    lead_id: object_id.optional(),
    type: one_of(PIECE_TYPES).optional(),
    title: z.string().trim().max(160).optional(),
    drive_url: http_url.optional(),
    author_bot: z.string().trim().max(80).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.client_id || value.lead_id, { message: 'Indica client_id o lead_id' });

export const patch_piece_schema = z
  .object({
    type: one_of(PIECE_TYPES).optional(),
    title: z.string().trim().max(160).optional(),
    drive_url: http_url.optional(),
    author_bot: z.string().trim().max(80).optional(),
    status: one_of(['borrador', 'publicado', 'archivado']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nada que actualizar' });

export const version_schema = z
  .object({
    drive_url: http_url.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.drive_url || value.note, { message: 'Indica drive_url o note' });

export const decision_schema = z
  .object({
    decision: z.enum(['aprobar', 'rechazar']),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict();

export const report_schema = z
  .object({
    client_id: object_id,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Usa el periodo YYYY-MM'),
    title: z.string().trim().max(160).optional(),
    drive_url: http_url.optional(),
    status: one_of(REPORT_STATUSES).optional(),
  })
  .strict();

export const patch_report_schema = z
  .object({
    title: z.string().trim().max(160).optional(),
    drive_url: http_url.optional(),
    status: one_of(REPORT_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nada que actualizar' });

export const meeting_schema = z
  .object({
    client_id: object_id.optional(),
    lead_id: object_id.optional(),
    title: z.string().trim().max(160).optional(),
    starts_at: iso_date.optional(),
    ends_at: iso_date.optional(),
    location: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    status: one_of(MEETING_STATUSES).optional(),
  })
  .strict()
  .refine((value) => value.client_id || value.lead_id, { message: 'Indica client_id o lead_id' });

export const patch_meeting_schema = z
  .object({
    title: z.string().trim().max(160).optional(),
    starts_at: iso_date.optional(),
    ends_at: iso_date.optional(),
    location: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    status: one_of(MEETING_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nada que actualizar' });

export const invoice_schema = z
  .object({
    client_id: object_id,
    concept: z.string().trim().min(1).max(200),
    amount_eur: z.number().positive().max(1_000_000),
    currency: z.literal('EUR').optional(),
    status: one_of(['borrador', 'pendiente', 'anulada']).optional(),
  })
  .strict();

const secret_value = z.union([
  z.string().min(1).max(4000),
  z
    .record(z.string().max(80), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
    .refine((value) => JSON.stringify(value).length <= 4000, 'Secreto demasiado grande'),
]);

export const credential_schema = z
  .object({
    provider: one_of(CREDENTIAL_PROVIDERS).optional(),
    label: z.string().trim().min(1).max(120),
    secret: secret_value,
  })
  .strict();

export const api_key_schema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(one_of(API_SCOPES)).min(1).max(API_SCOPES.length),
    client_ids: z.array(object_id).max(50).optional(),
  })
  .strict();

export const patch_api_key_schema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    scopes: z.array(one_of(API_SCOPES)).min(1).max(API_SCOPES.length).optional(),
    client_ids: z.array(object_id).max(50).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nada que actualizar' });

export const otp_verify_schema = z
  .object({
    challenge_id: z.string().min(20).max(200),
    code: z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
  })
  .strict();

export const otp_resend_schema = z
  .object({
    challenge_id: z.string().min(20).max(200),
  })
  .strict();
