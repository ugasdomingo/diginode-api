import Lead from '../models/lead_model.js';
import { generate_text } from './gemini_service.js';
import { RECEPCIONISTA_PROMPT, nora_demo_prompt } from '../utils/prompts.js';
import { DEMO_MESSAGE_LIMIT } from './usage_service.js';
import { PLANS } from '../config/plans.js';

// Fixed reply once a demo contact hits the message cap — never calls the LLM.
const DEMO_CAPPED_REPLY =
  'Me ha encantado charlar contigo 🙂 Esta demo tiene un límite de mensajes. ' +
  'Para activar a Nora en tu propio negocio, deja tus datos en la web y te contactamos.';

const process_message = async ({ contact_id, platform, message, sender_name = null, is_demo = false }) => {
  // Find or create the lead
  let lead = await Lead.findOne({ contact_id, platform });

  if (!lead) {
    lead = await Lead.create({
      contact_id,
      platform,
      name: sender_name,
      status: 'in_conversation',
      source: is_demo ? 'demo_whatsapp' : 'other',
      funnel_stage: 'demo_started',
      chat_history: [],
    });
  }

  // Demo cost guard: cap the public Nora demo per contact before touching the LLM.
  if (is_demo) {
    const user_turns = lead.chat_history.filter(m => m.role === 'user').length;
    if (user_turns >= DEMO_MESSAGE_LIMIT) {
      return { response: DEMO_CAPPED_REPLY, lead_id: lead._id.toString(), status: lead.status, capped: true };
    }
  }

  // Capture an email if the visitor types one — enables the follow-up sequence (F3-5).
  if (!lead.email) {
    const email_match = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (email_match) lead.email = email_match[0].toLowerCase();
  }

  const system_prompt = is_demo ? nora_demo_prompt(PLANS.entrepreneur) : RECEPCIONISTA_PROMPT;

  // Generate response using the full conversation history for context
  const ai_response = await generate_text(
    system_prompt,
    message,
    lead.chat_history.toObject ? lead.chat_history.toObject() : lead.chat_history,
    'flash'
  );

  // Append both turns to the chat history
  lead.chat_history.push(
    { role: 'user', parts: [{ text: message }] },
    { role: 'model', parts: [{ text: ai_response }] }
  );

  if (is_demo) {
    // Keep the funnel source pinned and promote to "identified" once we have a
    // name or once Nora shares the booking link (the demo's closing action).
    lead.source = 'demo_whatsapp';
    if (sender_name && !lead.name) lead.name = sender_name;
    const booking_link = process.env.CAL_BOOKING_LINK || '';
    const shared_booking = booking_link && ai_response.includes(booking_link);
    if (shared_booking) lead.status = 'qualified';
    if ((lead.name || shared_booking) && lead.funnel_stage === 'demo_started') {
      lead.funnel_stage = 'identified';
    }
  } else {
    // Qualify the lead when the AI shares the booking link
    const booking_link = process.env.CAL_BOOKING_LINK || '';
    if (lead.status === 'in_conversation' && booking_link && ai_response.includes(booking_link)) {
      lead.status = 'qualified';
    }
  }

  await lead.save();

  return {
    response: ai_response,
    lead_id: lead._id.toString(),
    status: lead.status,
  };
};

export { process_message };
