import { z } from 'zod';

// Mirrors BOLSA_VALID_IDS in stripe_service.js
const BOLSA_IDS = ['sofia', 'marcos', 'luna', 'valeria', 'elena', 'maya'];

// POST /api/bolsa/checkout
export const bolsa_checkout_schema = z.object({
  employee_ids: z.array(z.enum(BOLSA_IDS)).min(1, 'Selecciona al menos un empleado').max(BOLSA_IDS.length),
  installments: z.union([z.literal(1), z.literal(3)]).optional().default(1),
});

// POST /api/empleados/checkout — AI plan. employee_id only required for 'individual'
// (enforced in the service); here we just bound the shapes.
export const ai_plan_checkout_schema = z.object({
  plan:        z.enum(['individual', 'estudio', 'clinica']),
  employee_id: z.enum(['recepcionista', 'asistente', 'gestor-relaciones', 'content-manager']).optional(),
});
