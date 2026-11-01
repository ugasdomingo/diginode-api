import { Resend } from 'resend';
import logger from '../utils/logger.js';
import http_error from '../utils/http_error.js';

const escape_html = (value = '') =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const from_address = () => process.env.OTP_EMAIL_FROM || process.env.RESEND_FROM_EMAIL;

// Pluggable sender. `text` may contain a one-time code or a temporary password:
// it is sent to the provider and never written to the logs.
const deliver = async ({ to, subject, html, text }) => {
  const provider = process.env.OTP_EMAIL_PROVIDER || 'resend';

  if (provider === 'webhook') {
    const url = process.env.OTP_EMAIL_WEBHOOK_URL;
    if (!url) throw http_error(503, 'El correo de acceso no está configurado');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, subject, text }),
    });
    if (!response.ok) throw http_error(503, 'No se pudo enviar el correo de acceso');
    return;
  }

  if (provider === 'log') {
    if (process.env.NODE_ENV === 'production') {
      throw http_error(503, 'El correo de acceso no está configurado');
    }
    logger.info({ to, subject }, 'correo de acceso omitido (OTP_EMAIL_PROVIDER=log)');
    return;
  }

  if (!process.env.RESEND_API_KEY || !from_address()) {
    throw http_error(503, 'El correo de acceso no está configurado');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: from_address(), to, subject, html, text });
  if (result?.error) throw http_error(503, 'No se pudo enviar el correo de acceso');
};

export const send_otp_email = (to, code) => {
  const safe = escape_html(code);
  return deliver({
    to,
    subject: 'Tu código de acceso a Diginode',
    text: `Tu código de acceso es ${code}. Caduca en 10 minutos. Si no has sido tú, ignora este correo.`,
    html: `<p>Tu código de acceso es <strong data-otp="${safe}">${safe}</strong>.</p><p>Caduca en 10 minutos. Si no has sido tú, ignora este correo.</p>`,
  });
};

export const send_access_email = (to, { name, temporary_password }) => {
  const portal = `${process.env.FRONTEND_URL || ''}/login`;
  return deliver({
    to,
    subject: 'Acceso al portal de Diginode',
    text: `Hola ${name || ''}. Entra en ${portal} con ${to} y la contraseña temporal ${temporary_password}. Te pediremos un código por correo. Cambia la contraseña al entrar.`,
    html: `<p>Hola ${escape_html(name || '')},</p>
      <p>Ya puedes entrar en el portal de Diginode: <a href="${escape_html(portal)}">${escape_html(portal)}</a></p>
      <ul>
        <li>Email: ${escape_html(to)}</li>
        <li>Contraseña temporal: ${escape_html(temporary_password)}</li>
      </ul>
      <p>Al entrar te pediremos un código de 6 dígitos por correo. Cambia la contraseña la primera vez.</p>`,
  });
};
