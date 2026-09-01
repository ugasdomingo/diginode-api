import { get_training, public_training } from '../config/trainings.js';
import TrainingEnrollment from '../models/training_enrollment_model.js';
import User from '../models/user_model.js';
import { sign_token } from '../utils/jwt_utils.js';
import { stripe, handle_training_checkout, ensure_account } from './stripe_service.js';
import Payment from '../models/payment_model.js';
import { send_training_welcome_email } from './email_service.js';
import { notify_ops } from './ops_notify_service.js';

// How long the success-page auto-login link stays valid, measured from the
// moment the seat was recorded (i.e. from the payment). Long enough to survive
// a slow redirect or a distracted buyer, short enough that a leaked URL in a
// browser history or a referer header is worthless.
const CLAIM_WINDOW_MS = 30 * 60 * 1000;

const not_found = () => {
  const err = new Error('Formación no encontrada');
  err.status_code = 404;
  return err;
};

// ── Public catalogue ────────────────────────────────────────────────────────

// Landing payload: the training plus live seat availability.
const get_public_training = async (slug) => {
  const training = get_training(slug);
  if (!training) throw not_found();

  const seats_taken = await TrainingEnrollment.count_seats(training.slug);
  return public_training(training, { seats_taken });
};

// ── Inscripción gratuita ────────────────────────────────────────────────────

const bad_request = (message) => {
  const err = new Error(message);
  err.status_code = 400;
  return err;
};

// Alta por formulario, sin pasar por Stripe. Solo para talleres con precio 0:
// si el catálogo le pone precio, esta vía se cierra sola y manda el checkout.
//
// Sobre la sesión que devuelve: solo se entrega cuando la cuenta se acaba de
// crear. Si el correo ya tenía cuenta —por ejemplo, un cliente de Clínica
// Digital—, se registra la inscripción pero NO se inicia sesión: de lo
// contrario bastaría con teclear el correo de otra persona para entrar en su
// panel. En ese caso se le pide que entre con su contraseña de siempre.
const enroll_free = async ({ slug, name, email, pain_point, accepts_privacy }) => {
  const training = get_training(slug);
  if (!training) throw not_found();

  if (training.price > 0) {
    const err = new Error('Esta formación se reserva mediante pago.');
    err.status_code = 409;
    throw err;
  }

  if (training.status !== 'open') {
    const err = new Error('Las inscripciones para esta formación están cerradas.');
    err.status_code = 409;
    throw err;
  }

  const clean_name  = String(name ?? '').trim();
  const clean_email = String(email ?? '').trim().toLowerCase();
  const clean_pain  = String(pain_point ?? '').trim().slice(0, 1000);

  if (clean_name.length < 2)  throw bad_request('Dinos tu nombre para reservar la plaza.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(clean_email)) throw bad_request('Revisa tu correo: no parece válido.');
  if (!accepts_privacy)       throw bad_request('Necesitamos que aceptes la política de privacidad.');

  const already = await TrainingEnrollment.findOne({ training_slug: training.slug, email: clean_email });
  if (already) {
    const err = new Error('Ya tienes una plaza reservada con ese correo. Revisa tu bandeja de entrada.');
    err.status_code = 409;
    throw err;
  }

  const seats_taken = await TrainingEnrollment.count_seats(training.slug);
  if (seats_taken >= training.capacity) {
    const err = new Error('Plazas agotadas.');
    err.status_code = 409;
    throw err;
  }

  let enrollment;
  try {
    enrollment = await TrainingEnrollment.create({
      training_slug:       training.slug,
      email:               clean_email,
      name:                clean_name,
      pain_point:          clean_pain || undefined,
      privacy_accepted_at: new Date(),
      source:              'form',
      amount:              0,
      currency:            training.currency,
      status:              'paid',
    });
  } catch (err) {
    // Dos envíos simultáneos del mismo formulario.
    if (err?.code === 11000) {
      const e = new Error('Ya tienes una plaza reservada con ese correo.');
      e.status_code = 409;
      throw e;
    }
    throw err;
  }

  // Un fallo de correo no puede tumbar el alta: la plaza ya está dada.
  const send_welcome = async (to, payload) => {
    try {
      await send_training_welcome_email(to, { ...payload, training });
    } catch (err) {
      notify_ops(
        `:warning: *Fallo al enviar credenciales de formación* — ${to} (${training.name}). ` +
        `Error: ${err?.message ?? 'desconocido'}`
      ).catch(() => {});
    }
  };

  const { client, user_created } = await ensure_account({
    email:     clean_email,
    full_name: clean_name,
    plan:      'course',
    send_welcome,
  });

  if (client) {
    await TrainingEnrollment.findByIdAndUpdate(enrollment._id, { client_id: client._id });

    // Se registra como compra de 0 € para que aparezca en su panel igual que
    // cualquier otra, con sus detalles y sus requisitos.
    await Payment.create({
      client_id:       client._id,
      payer_email:     clean_email,
      payer_name:      clean_name,
      amount:          0,
      currency:        training.currency,
      description:     `${training.name} — inscripción gratuita`,
      type:            'course',
      reference_slug:  training.slug,
      reference_label: training.name,
    }).catch(() => {});
  }

  notify_ops([
    ':books: *Nueva inscripción al taller (gratuita)*',
    `*Formación:* ${training.name}`,
    `*Alumno:* ${clean_name} (${clean_email})`,
    `*Plazas:* ${seats_taken + 1}/${training.capacity}`,
    clean_pain ? `*Qué le quita tiempo:* ${clean_pain}` : '',
  ].filter(Boolean).join('\n')).catch(() => {});

  // Sesión inmediata solo si la cuenta es nueva (ver comentario de arriba).
  let session = null;
  if (user_created) {
    const user = await User.findOne({ email: clean_email });
    if (user) {
      session = {
        token: sign_token(
          { user_id: user._id, role: user.role, token_version: user.token_version ?? 0 },
          '24h'
        ),
        user: {
          id:                       user._id,
          email:                    user.email,
          role:                     user.role,
          client_id:                user.client_id,
          password_change_required: user.password_change_required ?? false,
        },
      };
    }
  }

  return {
    enrolled: true,
    account_existed: !user_created,
    session,
    training: { slug: training.slug, name: training.name },
  };
};

// ── Success-page auto-login ─────────────────────────────────────────────────

// Exchanges a Stripe Checkout session for a portal session.
//
// Trust chain: the session id is verified against Stripe itself (existence,
// product type and payment status), never against anything the browser claims.
// It is then spent — `claimed_at` is set through a conditional update, so two
// concurrent requests can never both walk away with a token.
const claim_training_session = async (session_id) => {
  if (typeof session_id !== 'string' || !session_id.startsWith('cs_')) {
    const err = new Error('Enlace de acceso no válido.');
    err.status_code = 400;
    throw err;
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch {
    const err = new Error('No hemos podido verificar tu pago. Revisa tu correo para entrar al panel.');
    err.status_code = 404;
    throw err;
  }

  if (session?.metadata?.type !== 'training') {
    const err = new Error('Enlace de acceso no válido.');
    err.status_code = 400;
    throw err;
  }

  if (session.payment_status !== 'paid') {
    const err = new Error('Tu pago aún no está confirmado. Espera unos segundos y vuelve a intentarlo.');
    err.status_code = 409;
    throw err;
  }

  const training = get_training(session.metadata.training_slug);
  if (!training) throw not_found();

  // Idempotent: creates the seat and the account if the webhook has not landed
  // yet, or returns the existing enrollment if it already did.
  const enrollment = await handle_training_checkout(session);

  if (!enrollment) {
    const err = new Error('No hemos podido confirmar tu inscripción. Escríbenos y lo resolvemos.');
    err.status_code = 409;
    throw err;
  }

  const expired = Date.now() - new Date(enrollment.created_at).getTime() > CLAIM_WINDOW_MS;
  if (expired || enrollment.claimed_at) {
    const err = new Error(
      'Este enlace de acceso ya no es válido. Entra con el email y la contraseña que te enviamos por correo.'
    );
    err.status_code = 410;
    throw err;
  }

  // Spend the link. The `claimed_at: null` filter is the atomic guard: whoever
  // loses the race gets null back and is told to use the emailed credentials.
  const spent = await TrainingEnrollment.findOneAndUpdate(
    { _id: enrollment._id, claimed_at: null },
    { claimed_at: new Date() },
    { new: true }
  );

  if (!spent) {
    const err = new Error(
      'Este enlace de acceso ya se ha usado. Entra con el email y la contraseña que te enviamos por correo.'
    );
    err.status_code = 410;
    throw err;
  }

  const user = await User.findOne({ email: enrollment.email });

  if (!user || !user.is_active) {
    const err = new Error('Tu cuenta aún se está preparando. Revisa tu correo en unos minutos.');
    err.status_code = 409;
    throw err;
  }

  const token = sign_token(
    { user_id: user._id, role: user.role, token_version: user.token_version ?? 0 },
    '24h'
  );

  return {
    token,
    user: {
      id:                       user._id,
      email:                    user.email,
      role:                     user.role,
      client_id:                user.client_id,
      password_change_required: user.password_change_required ?? false,
    },
    training: {
      slug: training.slug,
      name: training.name,
    },
  };
};

export { get_public_training, enroll_free, claim_training_session, CLAIM_WINDOW_MS };
