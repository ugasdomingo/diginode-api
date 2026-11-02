import { z } from 'zod';

const money = z.number().positive().max(1_000_000);
export const proposal_input_schema = z
  .object({
    service: z.enum(['brand_management', 'web_project']),
    currency: z.enum(['EUR', 'USD']),
    vat_rate: z.number().min(0).max(30).default(21),
    items: z
      .array(
        z.object({
          label: z.string().trim().min(2).max(120),
          detail: z.string().trim().max(300).default(''),
        })
      )
      .min(1)
      .max(15),
    monthly: money.optional(),
    setup: z.number().min(0).max(1_000_000).optional().default(0),
    total: money.optional(),
    due_now: money.optional(),
    message: z.string().trim().max(2000).optional().default(''),
    valid_days: z.number().int().min(1).max(90).default(15),
    send_email: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.service === 'brand_management' && !value.monthly)
      ctx.addIssue({ code: 'custom', path: ['monthly'], message: 'Indica la mensualidad' });
    if (value.service === 'web_project') {
      if (!value.total)
        ctx.addIssue({ code: 'custom', path: ['total'], message: 'Indica el total' });
      if (value.due_now && value.total && value.due_now > value.total)
        ctx.addIssue({ code: 'custom', path: ['due_now'], message: 'El pago inicial supera el total' });
    }
  });
