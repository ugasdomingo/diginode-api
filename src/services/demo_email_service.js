import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import DemoAction from '../models/demo_action_model.js';
import Lead from '../models/lead_model.js';
import { PLANS } from '../config/plans.js';
import { send_nora_demo_email } from './email_service.js';
import { demo_error, reserve_quota } from './demo_guard_service.js';

export const summary_for = (context) =>
  context === 'agency'
    ? 'Diginode dirige y ejecuta marca y marketing para microempresas y pymes. Acordamos prioridades, presupuesto y entregas, con reunión mensual o quincenal. Propuesta según tu operación. Publicidad, producción externa y nuevos desarrollos se presupuestan aparte. Solicita una revisión en https://midiginode.com/#contacto'
    : context === 'web'
      ? 'Diginode crea webs comerciales, catálogos con solicitud de presupuesto y aplicaciones internas. Definimos alcance, fases, validación, propiedad y mantenimiento antes de contratar. Presupuesto según alcance; proveedores y ampliaciones se acuerdan aparte. https://midiginode.com/webs-y-aplicaciones#contacto'
      : `Clínica Digital de Diginode: web profesional y ${PLANS.clinica.employees_included} empleados IA por ${PLANS.clinica.monthly} EUR/mes. Consulta alcance y condiciones en https://midiginode.com/clinica-digital . La agenda de la demo es ficticia y no reserva citas.`;

export async function prepare_demo_email(lead, recipient, context, supports_confirmation) {
  const parsed = z
    .email()
    .max(254)
    .safeParse(
      String(recipient ?? '')
        .trim()
        .toLowerCase()
    );
  if (!parsed.success) return { error: 'Pide una dirección de correo válida.' };
  if (lead.email !== parsed.data)
    return {
      error:
        'Solo se puede preparar un correo para la dirección indicada por la persona en el chat.',
    };
  if (!supports_confirmation)
    return {
      summary: summary_for(context),
      message:
        'Este widget no admite confirmación. Muestra el resumen en pantalla y ofrece contacto humano. No se ha enviado correo.',
    };
  if ((lead.demo_emails_sent ?? 0) >= 2)
    return { error: 'Máximo de dos correos por contacto alcanzado.' };
  const action = await DemoAction.create({
    _id: randomUUID(),
    contact_id: lead.contact_id,
    recipient: parsed.data,
    summary: summary_for(context),
    expires_at: new Date(Date.now() + 10 * 60000),
  });
  return {
    pending_action: {
      id: action._id,
      type: 'confirm_email',
      recipient: action.recipient,
      summary: action.summary,
      expires_at: action.expires_at,
    },
    message:
      'El correo está preparado. Solo se envía cuando la persona pulsa Confirmar envío en la web.',
  };
}

export async function confirm_demo_email(contact_id, action_id) {
  const existing = await DemoAction.findOne({ _id: action_id, contact_id });
  if (!existing) throw demo_error('Confirmación no disponible.', 404);
  if (existing.status === 'sent')
    return { success: true, status: 'sent', message: 'Correo enviado.' };
  if (existing.expires_at <= new Date())
    throw demo_error('La confirmación ha caducado. Pide un nuevo resumen.', 410);
  if (existing.status === 'sending')
    return {
      success: true,
      status: 'sending',
      message: 'Envío en proceso. No vuelvas a solicitarlo.',
    };
  if (existing.status === 'failed')
    throw demo_error(
      'El envío no se completó. Puedes pedir otro resumen o contactar por el formulario.',
      409
    );
  const action = await DemoAction.findOneAndUpdate(
    { _id: action_id, contact_id, status: 'pending', expires_at: { $gt: new Date() } },
    { $set: { status: 'sending' } },
    { new: true }
  );
  if (!action) return { success: true, status: 'sending', message: 'Envío en proceso.' };
  try {
    const lead = await Lead.findOneAndUpdate(
      { contact_id, platform: 'website', demo_emails_sent: { $lt: 2 } },
      { $inc: { demo_emails_sent: 1 } },
      { new: true }
    );
    if (!lead) throw demo_error('Máximo de correos de este contacto alcanzado.');
    const recipient_key = createHash('sha256').update(action.recipient).digest('hex');
    const quota = await reserve_quota(
      `email:${new Date().toISOString().slice(0, 10)}:${recipient_key}`,
      2,
      new Date(Date.now() + 2 * 86400000)
    );
    if (!quota) throw demo_error('Máximo de correos para este destinatario alcanzado.');
    await send_nora_demo_email(action.recipient, {
      subject: 'Resumen solicitado de Diginode',
      body: action.summary,
      idempotency_key: action._id,
    });
    await DemoAction.updateOne(
      { _id: action._id },
      { $set: { status: 'sent', sent_at: new Date(), expires_at: new Date(Date.now() + 86400000) } }
    );
    return {
      success: true,
      status: 'sent',
      message: 'Correo enviado. No te has suscrito a publicidad.',
    };
  } catch (err) {
    await DemoAction.updateOne({ _id: action._id }, { $set: { status: 'failed' } });
    if (err.status_code) throw err;
    throw demo_error(
      'No se pudo confirmar la entrega del correo. Contacta mediante el formulario.',
      503
    );
  }
}
