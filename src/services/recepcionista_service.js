import Lead from '../models/lead_model.js';
import Knowledge from '../models/knowledge_model.js';
import { run_turn } from './anthropic_service.js';
import { RECEPCIONISTA_PROMPT, nora_demo_prompt } from '../utils/prompts.js';
import { DEMO_MESSAGE_LIMIT } from './usage_service.js';
import { NORA_DEMO_TOOLS, make_nora_tool_executor } from './nora_tools_service.js';
import { PLANS } from '../config/plans.js';

// Fixed reply once a demo contact hits the message cap — never calls the LLM.
const DEMO_CAPPED_REPLY =
  'Me ha encantado charlar contigo 🙂 Esta demo tiene un límite de mensajes. ' +
  'Para activar a Nora en tu propio negocio, deja tus datos en la web y te contactamos.';

// Converts stored chat history (Gemini-style { role:'user'|'model', parts:[{text}] })
// into Anthropic's message format.
const to_anthropic_messages = (history) =>
  history.map((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.parts?.[0]?.text ?? '',
  }));

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
    const user_turns = lead.chat_history.filter((m) => m.role === 'user').length;
    if (user_turns >= DEMO_MESSAGE_LIMIT) {
      return { response: DEMO_CAPPED_REPLY, lead_id: lead._id.toString(), status: lead.status, capped: true };
    }
  }

  // Capture an email if the visitor types one — enables the follow-up sequence (F3-5).
  if (!lead.email) {
    const email_match = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (email_match) lead.email = email_match[0].toLowerCase();
  }

  // Build the system prompt. Demo loads the editable FAQ + agent tools; the real
  // receptionist runs a plain conversation.
  let system_prompt = RECEPCIONISTA_PROMPT;
  let tools = [];
  let tool_executor;

  if (is_demo) {
    const kb = await Knowledge.findOne({ key: 'nora_demo' });
    system_prompt = nora_demo_prompt(PLANS.entrepreneur, kb?.content ?? '');
    tools = NORA_DEMO_TOOLS;
    tool_executor = make_nora_tool_executor(lead);
  }

  // Generate the reply with Claude Haiku (recepcionista model), with tool use in demo.
  const ai_response = await run_turn({
    employee: 'recepcionista',
    system: system_prompt,
    messages: [...to_anthropic_messages(lead.chat_history), { role: 'user', content: message }],
    tools,
    tool_executor,
  });

  // Append both turns to the chat history
  lead.chat_history.push(
    { role: 'user', parts: [{ text: message }] },
    { role: 'model', parts: [{ text: ai_response }] }
  );

  const booking_link = process.env.CAL_BOOKING_LINK || '';
  const shared_booking = booking_link && ai_response.includes(booking_link);

  if (is_demo) {
    lead.source = 'demo_whatsapp';
    if (sender_name && !lead.name) lead.name = sender_name;
    if (shared_booking) lead.status = 'qualified';
    if ((lead.name || lead.email || shared_booking) && lead.funnel_stage === 'demo_started') {
      lead.funnel_stage = 'identified';
    }
  } else if (lead.status === 'in_conversation' && shared_booking) {
    lead.status = 'qualified';
  }

  await lead.save();

  return {
    response: ai_response,
    lead_id: lead._id.toString(),
    status: lead.status,
  };
};

export { process_message };
