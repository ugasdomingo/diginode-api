import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL;

const send_welcome_email = async (to, { name, temp_password }) => {
  await resend.emails.send({
    from: FROM,
    to,
    subject: '¡Bienvenido/a a bordo! 🎉 Aquí están tus accesos',
    html: `
      <h2>Hola ${name},</h2>
      <p>Tu acceso al portal está listo. Usa estas credenciales para entrar:</p>
      <ul>
        <li><strong>Email:</strong> ${to}</li>
        <li><strong>Contraseña temporal:</strong> ${temp_password}</li>
      </ul>
      <p><strong>Deberás cambiar tu contraseña la primera vez que inicies sesión.</strong></p>
      <p>Cualquier duda, abre un ticket desde el portal.</p>
      <br>
      <p>El equipo de Diginode</p>
    `,
  });
};

const send_suspension_email = async (to, { name }) => {
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Tu suscripción ha sido pausada',
    html: `
      <h2>Hola ${name},</h2>
      <p>Tu suscripción ha sido pausada porque no pudimos procesar el último pago.</p>
      <p>Para reactivar tu acceso, actualiza tu método de pago desde el portal.</p>
      <br>
      <p>El equipo de Diginode</p>
    `,
  });
};

// ── Follow-up sequence (F3-5) ───────────────────────────────────────────────
// Four-touch nurture for demo leads who gave their data but didn't buy.
const FOLLOWUP_STEPS = {
  1: {
    subject: 'Lo que Nora haría en tu negocio',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>Ayer probaste a Nora. Esto es lo que haría por ti desde el día 1: contestar
      cada WhatsApp en segundos, agendar tus citas y filtrar lo que de verdad necesita tu atención.</p>
      <p>Mientras tú trabajas o descansas, ella atiende. ¿Hablamos de ponerla en tu negocio?</p>`,
  },
  2: {
    subject: 'Un caso real (en 60 segundos)',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>Negocios como el tuyo recuperan horas cada semana dejando que el empleado IA
      conteste y agende. Sin contratar a nadie y sin migrar de herramienta.</p>
      <p>Si quieres, te enseñamos cómo lo configuramos para tu caso concreto.</p>`,
  },
  3: {
    subject: '¿Te quedó alguna duda?',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>Las dudas más habituales: «¿y si contesta algo que yo no firmaría?» (tú defines
      qué puede decir y cuándo escalar) y «¿es complicado?» (lo montamos nosotros en 7 días).</p>
      <p>Responde a este correo con tu duda y te la resolvemos.</p>`,
  },
  4: {
    subject: '14 días de garantía — sin riesgo',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>El Plan Entrepreneur tiene <strong>garantía de 14 días</strong>: si no te ahorra
      tiempo, te devolvemos el mes. Y sin permanencia.</p>
      <p>Activamos pocos negocios al mes por capacidad de onboarding. Si lo quieres este mes,
      este es el momento.</p>`,
  },
};

const send_followup_email = async (to, { name, step }) => {
  const tpl = FOLLOWUP_STEPS[step];
  if (!tpl) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: tpl.subject,
    html: `${tpl.body(name)}<br><p>El equipo de DigiNode</p>`,
  });
};

// ── Nora demo email (N3) ────────────────────────────────────────────────────
const escape_html = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Email composed by Nora during the public demo. `body` is visitor-dictated, so
// it is HTML-escaped. Carries a clear demo footer.
const send_nora_demo_email = async (to, { subject, body, name }) => {
  await resend.emails.send({
    from: FROM,
    to,
    subject: subject || 'Un mensaje de Nora (DigiNode)',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
        <h2>Hola${name ? ' ' + escape_html(name) : ''},</h2>
        <p>Soy <strong>Nora</strong>, la recepcionista con IA de DigiNode. Me pediste que te enviara esto:</p>
        <blockquote style="border-left: 3px solid #1E90FF; margin: 16px 0; padding: 8px 16px; color: #333;">
          ${escape_html(body)}
        </blockquote>
        <p>Si quieres una recepcionista como yo atendiendo tu negocio 24/7, estaré encantada de ayudarte.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="font-size: 12px; color: #888;">
          Este correo se generó desde la demo pública de DigiNode a petición tuya. Si no lo solicitaste, ignóralo.
        </p>
      </div>
    `,
  });
};

export { send_welcome_email, send_suspension_email, send_followup_email, send_nora_demo_email };
