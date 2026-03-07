import Lead from '../models/lead_model.js';
import { generate_text } from './gemini_service.js';
import { RECEPCIONISTA_PROMPT } from '../utils/prompts.js';

const process_message = async ({ contact_id, platform, message, sender_name = null }) => {
  // Find or create the lead
  let lead = await Lead.findOne({ contact_id, platform });

  if (!lead) {
    lead = await Lead.create({
      contact_id,
      platform,
      name: sender_name,
      status: 'in_conversation',
      chat_history: [],
    });
  }

  // Generate response using the full conversation history for context
  const ai_response = await generate_text(
    RECEPCIONISTA_PROMPT,
    message,
    lead.chat_history.toObject ? lead.chat_history.toObject() : lead.chat_history,
    'flash'
  );

  // Append both turns to the chat history
  lead.chat_history.push(
    { role: 'user', parts: [{ text: message }] },
    { role: 'model', parts: [{ text: ai_response }] }
  );

  // Qualify the lead when the AI shares the booking link
  const booking_link = process.env.CAL_BOOKING_LINK || '';
  if (lead.status === 'in_conversation' && booking_link && ai_response.includes(booking_link)) {
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
