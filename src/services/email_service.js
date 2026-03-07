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
      <p>Te recomendamos cambiar tu contraseña al iniciar sesión.</p>
      <p>Cualquier duda, abre un ticket desde el portal.</p>
      <br>
      <p>El equipo de DigiEmpresas</p>
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
      <p>El equipo de DigiEmpresas</p>
    `,
  });
};

export { send_welcome_email, send_suspension_email };
