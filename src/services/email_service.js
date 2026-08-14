import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL;

const send_welcome_email = async (to, { name, temp_password }) => {
  const portal_url = `${process.env.FRONTEND_URL}/login`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: '¡Bienvenido/a a tu Clínica Digital! 🎉 Aquí están tus accesos',
    html: `
      <h2>Hola ${name},</h2>
      <p>Tu Clínica Digital está en marcha. Este es tu acceso al panel de cliente:</p>
      <ul>
        <li><strong>Portal:</strong> <a href="${portal_url}">${portal_url}</a></li>
        <li><strong>Email:</strong> ${to}</li>
        <li><strong>Contraseña temporal:</strong> ${temp_password}</li>
      </ul>
      <p><strong>Deberás cambiar tu contraseña la primera vez que inicies sesión.</strong></p>
      <p><strong>Siguiente paso:</strong> entra al portal y completa el formulario de bienvenida
      con la información de tu consulta. Con eso configuro tu web y tus 3 empleados IA
      (Nora, Alex y Valeria) y en unos 7 días lo tienes todo funcionando.</p>
      <p>Cualquier duda, abre un ticket desde el portal o agenda una reunión conmigo desde tu panel.</p>
      <br>
      <p>El equipo de DigiNode</p>
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
// Copy alineado al modelo vigente: Clínica Digital 150€/mes para psicólogos,
// coaches y terapeutas, sin permanencia y con opción a compra a las 12 cuotas.
const FOLLOWUP_STEPS = {
  1: {
    subject: 'Lo que Nora haría en tu consulta',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>Ayer probaste a Nora. Esto es lo que haría por ti desde el día 1: contestar
      a cada paciente en segundos, agendar tus citas en tu calendario real y filtrar
      lo que de verdad necesita tu atención.</p>
      <p>Mientras tú pasas consulta o descansas, ella atiende. ¿La ponemos a trabajar en tu clínica?</p>`,
  },
  2: {
    subject: 'Tu consulta, funcionando sola en internet',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>La Clínica Digital es tu web profesional con 3 empleados IA dentro: Nora atiende
      y agenda, Alex vigila que todo funcione y Valeria crea contenido para tus redes.
      Profesionales como tú recuperan horas cada semana sin contratar a nadie.</p>
      <p>Si quieres, te enseño cómo quedaría configurada para tu caso concreto.</p>`,
  },
  3: {
    subject: '¿Te quedó alguna duda?',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>Las dudas más habituales: «¿y si contesta algo que yo no firmaría?» (tú defines
      qué puede decir y cuándo pasarte la conversación) y «¿es complicado?» (lo monto yo
      y en unos 7 días lo tienes funcionando).</p>
      <p>Responde a este correo con tu duda y te la resuelvo.</p>`,
  },
  4: {
    subject: 'Sin permanencia — y tuya al completar 12 cuotas',
    body: (name) => `
      <h2>Hola ${name || ''},</h2>
      <p>La Clínica Digital son <strong>150€/mes, sin permanencia</strong>: puedes cancelar
      cuando quieras. Y al completar 12 cuotas, la web y los empleados IA pasan a ser
      <strong>tuyos</strong> — tu dominio y los datos de tus pacientes lo son desde el día 1.</p>
      <p>Activo pocas clínicas al mes por capacidad de onboarding. Si la quieres este mes,
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
        <p>Si quieres una recepcionista como yo atendiendo tu consulta 24/7, estaré encantada de ayudarte.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="font-size: 12px; color: #888;">
          Este correo se generó desde la demo pública de DigiNode a petición tuya. Si no lo solicitaste, ignóralo.
        </p>
      </div>
    `,
  });
};

export { send_welcome_email, send_suspension_email, send_followup_email, send_nora_demo_email };
