import SupportTicket from '../models/support_ticket_model.js';
import { generate_json } from './gemini_service.js';
import { INGENIERO_PROMPT, SALES_ANALYST_PROMPT } from '../utils/prompts.js';

const TICKET_SCHEMA = {
  type: 'object',
  properties: {
    analysis: { type: 'string' },
    solution: { type: 'string' },
    requires_ceo: { type: 'boolean' },
  },
  required: ['analysis', 'solution', 'requires_ceo'],
};

const SALES_SCHEMA = {
  type: 'object',
  properties: {
    client_name: { type: 'string' },
    company: { type: 'string' },
    pain_points: { type: 'array', items: { type: 'string' } },
    proposed_solution: { type: 'string' },
    next_steps: { type: 'array', items: { type: 'string' } },
    estimated_plan: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['client_name', 'pain_points', 'proposed_solution', 'next_steps'],
};

// Analyzes a support ticket and generates an AI response
const analyze_ticket = async (ticket_id) => {
  const ticket = await SupportTicket.findById(ticket_id).populate('client_id', 'name services');

  if (!ticket) {
    const err = new Error('Ticket not found');
    err.status_code = 404;
    throw err;
  }

  const prompt = `
Ticket: ${ticket.title}
Description: ${ticket.description}
Client services: ${ticket.client_id?.services?.join(', ') || 'unknown'}
  `.trim();

  const result = await generate_json(INGENIERO_PROMPT, prompt, TICKET_SCHEMA, 'pro');

  ticket.ai_response = `${result.analysis}\n\n${result.solution}`;
  ticket.requires_ceo = result.requires_ceo;
  ticket.status = result.requires_ceo ? 'pending_review' : 'in_progress';
  await ticket.save();

  return ticket;
};

// Analyzes a meeting transcript and returns a structured proposal
const analyze_meeting = async (transcript) => {
  return generate_json(SALES_ANALYST_PROMPT, transcript, SALES_SCHEMA, 'pro');
};

export { analyze_ticket, analyze_meeting };
