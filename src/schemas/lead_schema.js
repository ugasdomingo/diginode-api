import { z } from 'zod';
import { SERVICE_IDS } from '../config/services.js';
import {
  CONTACT_LOCATIONS,
  CONTACT_TYPES,
  JOURNEY_EVENT_LIMIT,
  parse_consent_text,
  parse_domain,
  parse_event_time,
  parse_path,
  parse_text_version,
  parse_utm,
  parse_visitor_id,
} from '../services/measurement_fields.js';

const journey_event_schema = z.object({
  type: z.enum(['pageview', 'contact_click']),
  path: z.string().trim().min(1).max(500),
  at: z.string().trim().min(4).max(40),
  contact_type: z.enum(CONTACT_TYPES).optional(),
  location: z.enum(CONTACT_LOCATIONS).optional(),
});

const canonicalize_lead = (value) => {
  const next = { ...value };
  if (value.visitor_id) next.visitor_id = parse_visitor_id(value.visitor_id);
  if (value.journey_consent) {
    const consent = { accepted: value.journey_consent.accepted === true };
    if (value.journey_consent.text_version) {
      consent.text_version = parse_text_version(value.journey_consent.text_version);
    }
    if (value.journey_consent.text) {
      const text = parse_consent_text(value.journey_consent.text);
      if (text) consent.text = text;
    }
    if (value.journey_consent.at) {
      const at = parse_event_time(value.journey_consent.at);
      if (at) consent.at = at.toISOString();
    }
    next.journey_consent = consent;
  }
  if (value.journey) {
    const entry = value.journey.entry ?? {};
    next.journey = {
      entry: {
        referrer_domain: parse_domain(entry.referrer_domain) || '',
        utm_source: parse_utm(entry.utm_source) || '',
        utm_medium: parse_utm(entry.utm_medium) || '',
        utm_campaign: parse_utm(entry.utm_campaign) || '',
      },
      events: (value.journey.events ?? []).map((event) => {
        const at = parse_event_time(event.at);
        const normalized = {
          type: event.type,
          path: parse_path(event.path),
          at: at.toISOString(),
        };
        if (event.contact_type) normalized.contact_type = event.contact_type;
        if (event.location) normalized.location = event.location;
        return normalized;
      }),
    };
  }
  return next;
};

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
    visitor_id: z.string().trim().max(36).optional(),
    journey_consent: z
      .object({
        accepted: z.boolean(),
        text_version: z.string().trim().max(200).optional(),
        text: z.string().max(4000).optional(),
        at: z.string().trim().max(40).optional(),
      })
      .optional(),
    journey: z
      .object({
        entry: z
          .object({
            referrer_domain: z.string().trim().max(253).optional(),
            utm_source: z.string().trim().max(200).optional(),
            utm_medium: z.string().trim().max(200).optional(),
            utm_campaign: z.string().trim().max(200).optional(),
          })
          .optional(),
        events: z.array(journey_event_schema).max(JOURNEY_EVENT_LIMIT).optional(),
      })
      .optional(),
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

    if (value.visitor_id != null && !parse_visitor_id(value.visitor_id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['visitor_id'],
        message: 'visitor_id debe ser un UUID v4',
      });
    }

    const consent = value.journey_consent;
    if (consent?.text_version != null && consent.text_version !== '' && !parse_text_version(consent.text_version)) {
      ctx.addIssue({
        code: 'custom',
        path: ['journey_consent', 'text_version'],
        message: 'Versión del texto de consentimiento no válida',
      });
    }
    if (consent?.text != null && consent.text !== '' && parse_consent_text(consent.text) == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['journey_consent', 'text'],
        message: 'Texto de consentimiento no válido',
      });
    }
    if (consent?.accepted === true) {
      if (!parse_text_version(consent.text_version ?? '')) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey_consent', 'text_version'],
          message: 'Indica la versión del texto de consentimiento',
        });
      }
      if (!parse_event_time(consent.at ?? '')) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey_consent', 'at'],
          message: 'Indica la fecha del consentimiento',
        });
      }
    } else if (consent?.at != null && consent.at !== '' && !parse_event_time(consent.at)) {
      ctx.addIssue({
        code: 'custom',
        path: ['journey_consent', 'at'],
        message: 'Fecha de consentimiento no válida',
      });
    }

    const journey = value.journey;
    if (journey?.entry) {
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
        if (journey.entry[key] != null && journey.entry[key] !== '' && parse_utm(journey.entry[key]) == null) {
          ctx.addIssue({
            code: 'custom',
            path: ['journey', 'entry', key],
            message: 'Valor de campaña no permitido',
          });
        }
      }
      if (
        journey.entry.referrer_domain != null &&
        journey.entry.referrer_domain !== '' &&
        parse_domain(journey.entry.referrer_domain) == null
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey', 'entry', 'referrer_domain'],
          message: 'Dominio de procedencia no permitido',
        });
      }
    }
    for (const [index, event] of (journey?.events ?? []).entries()) {
      if (!parse_path(event.path)) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey', 'events', index, 'path'],
          message: 'Ruta no permitida',
        });
      }
      if (!parse_event_time(event.at)) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey', 'events', index, 'at'],
          message: 'Fecha del evento no válida',
        });
      }
      if (event.type === 'contact_click' && !CONTACT_TYPES.includes(event.contact_type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey', 'events', index, 'contact_type'],
          message: 'Tipo de contacto no permitido',
        });
      }
      if (event.type === 'pageview' && event.contact_type) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey', 'events', index, 'contact_type'],
          message: 'Una visita no lleva tipo de contacto',
        });
      }
      if (event.type === 'pageview' && event.location) {
        ctx.addIssue({
          code: 'custom',
          path: ['journey', 'events', index, 'location'],
          message: 'Una visita no lleva ubicación de contacto',
        });
      }
    }
  })
  .transform(canonicalize_lead);
