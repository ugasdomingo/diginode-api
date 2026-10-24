import Lead from '../models/lead_model.js';
import Knowledge from '../models/knowledge_model.js';
import { run_turn } from './anthropic_service.js';
import { recepcionista_prompt, nora_demo_prompt } from '../utils/prompts.js';
import { NORA_DEMO_TOOLS, make_nora_tool_executor } from './nora_tools_service.js';
import { PLANS } from '../config/plans.js';
import { acquire_demo, release_demo } from './demo_guard_service.js';
import { NORA_DEMO_KB } from '../config/nora_kb.js';
import { demo_actions } from '../config/services.js';
import { open_trainings } from '../config/trainings.js';

// Converts stored chat history (Gemini-style { role:'user'|'model', parts:[{text}] })
// into Anthropic's message format.
const to_anthropic_messages = (history) =>
  history.map((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.parts?.[0]?.text ?? '',
  }));

const process_message = async ({
  contact_id,
  platform,
  message,
  sender_name = null,
  is_demo = false,
  context = 'clinic',
  supports_confirmation = false,
}) => {
  if (is_demo && (platform !== 'website' || !/^demo-[a-zA-Z0-9-]{8,100}$/.test(contact_id)))
    throw Object.assign(new Error('Contacto de demo no válido'), { status_code: 400 });
  // Find or create the lead
  let lead = await Lead.findOne({ contact_id, platform });

  if (!lead) {
    try {
      lead = await Lead.create({
        contact_id,
        platform,
        name: sender_name,
        status: 'in_conversation',
        source: is_demo ? 'demo_whatsapp' : 'other',
        funnel_stage: 'demo_started',
        chat_history: [],
        ...(is_demo
          ? {
              service_interest: {
                agency: 'brand_management',
                web: 'web_project',
                clinic: 'digital_clinic',
              }[context],
              demo_started_at: new Date(),
              privacy_shown_at: new Date(),
              privacy_version: '2026-10',
            }
          : {}),
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      lead = await Lead.findOne({ contact_id, platform });
    }
  }

  let lock;
  const actions = is_demo ? demo_actions(context) : [];
  if (is_demo) {
    lock = await acquire_demo(lead);
    if (!lock)
      return {
        response:
          'Has alcanzado el límite de la demo. Podemos revisar tu caso por el formulario de esta página.',
        capped: true,
        actions,
      };
  }
  try {
    if (is_demo) {
      const current = await Lead.findById(lead._id);
      if (current) lead = current;
      else throw Object.assign(new Error('La conversación ya no está disponible.'), { status_code: 404 });
    }
    let pending_action;
    // A declared email is contact information; it never authorizes marketing.
    {
      const email_match = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (email_match) lead.email = email_match[0].toLowerCase();
    }

    // Build the system prompt. Demo loads the editable FAQ + agent tools; the real
    // receptionist runs a plain conversation.
    // Solo las formaciones vigentes: una ya celebrada desaparece del prompt sola.
    const trainings = open_trainings();

    let system_prompt = recepcionista_prompt(PLANS.clinica, trainings);
    let tools = [];
    let tool_executor;

    if (is_demo) {
      const kb = await Knowledge.findOne({ key: 'nora_demo' });
      system_prompt = nora_demo_prompt(
        PLANS.clinica,
        (kb?.content ?? NORA_DEMO_KB).slice(0, 16000),
        trainings,
        context
      );
      tools = NORA_DEMO_TOOLS;
      tool_executor = make_nora_tool_executor(lead, {
        context,
        supports_confirmation,
        on_pending: (action) => {
          pending_action = action;
        },
      });
    }

    // Generate the reply with Claude Haiku (recepcionista model), with tool use in demo.
    const ai_response = await run_turn({
      employee: 'recepcionista',
      system: system_prompt,
      messages: [
        ...to_anthropic_messages(is_demo ? lead.chat_history.slice(-12) : lead.chat_history),
        { role: 'user', content: message },
      ],
      tools,
      tool_executor,
      ...(is_demo ? { is_demo: true, max_iterations: 3 } : {}),
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
      actions,
      pending_action,
    };
  } finally {
    if (is_demo && lock) await release_demo(lead._id, lock);
  }
};

export { process_message };
