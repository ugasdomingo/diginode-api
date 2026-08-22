import { get_training, public_training } from '../config/trainings.js';
import TrainingEnrollment from '../models/training_enrollment_model.js';
import User from '../models/user_model.js';
import { sign_token } from '../utils/jwt_utils.js';
import { stripe, handle_training_checkout } from './stripe_service.js';

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

export { get_public_training, claim_training_session, CLAIM_WINDOW_MS };
