import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL;

// Visitor- and buyer-supplied values land in HTML emails; always escape them.
const escape_html = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

// Live training welcome — doubles as the portal credentials email, since the
// buyer had no account until they paid. Carries the logistics and the
// requirements so the attendee can prepare without digging through the portal.
const format_training_date = (iso) => {
  if (!iso) return 'fecha por confirmar';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

const send_training_welcome_email = async (to, { name, temp_password, training }) => {
  const portal_url = `${process.env.FRONTEND_URL}/login`;
  const when = [
    format_training_date(training.date),
    training.time ? `a las ${training.time}` : null,
    training.duration ? `(${training.duration})` : null,
  ].filter(Boolean).join(' ');

  const requirements_html = (training.requirements ?? [])
    .map((r) => `<li>${escape_html(r)}</li>`)
    .join('');

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Plaza confirmada: ${training.name} 🎉`,
    html: `
      <h2>Hola ${escape_html(name ?? '')},</h2>
      <p>Tu plaza en <strong>${escape_html(training.name)}</strong> está confirmada. Nos vemos el ${escape_html(when)}.</p>

      <h3>Los detalles</h3>
      <ul>
        <li><strong>Cuándo:</strong> ${escape_html(when)}${training.timezone ? ' (hora de España)' : ''}</li>
        <li><strong>Dónde:</strong> ${escape_html(training.platform ?? 'Online')}</li>
        <li><strong>Enlace de acceso:</strong> ${
          training.meet_url
            ? `<a href="${training.meet_url}">${training.meet_url}</a>`
            : 'te lo envío por correo antes de la sesión'
        }</li>
      </ul>

      <h3>Tu acceso al panel</h3>
      <p>He creado tu cuenta para que tengas los detalles del taller siempre a mano:</p>
      <ul>
        <li><strong>Panel:</strong> <a href="${portal_url}">${portal_url}</a></li>
        <li><strong>Email:</strong> ${escape_html(to)}</li>
        <li><strong>Contraseña temporal:</strong> ${escape_html(temp_password ?? '')}</li>
      </ul>
      <p><strong>Se te pedirá cambiarla la primera vez que entres.</strong></p>

      <h3>Qué necesitas para aprovecharlo</h3>
      <ul>${requirements_html}</ul>

      <p>Si te surge cualquier duda, responde a este correo.</p>
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

export {
  send_welcome_email,
  send_training_welcome_email,
  send_suspension_email,
  send_followup_email,
  send_nora_demo_email,
};
