import Anthropic from '@anthropic-ai/sdk';
import { record_usage } from './usage_service.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model assignments per employee type
const MODELS = {
  recepcionista:       'claude-haiku-4-5-20251001',  // high volume, cost-sensitive
  asistente:           'claude-sonnet-4-6',           // complex tasks
  'gestor-relaciones': 'claude-sonnet-4-6',           // second brain requires depth
  'content-manager':   'claude-sonnet-4-6',           // creative work
  default:             'claude-haiku-4-5-20251001',
};

const MAX_ITERATIONS = 10; // safety cap on the tool-use loop

/**
 * Runs a full agentic conversation turn with tool use.
 *
 * @param {object} opts
 * @param {string}   opts.employee      - Employee slug (for model selection)
 * @param {string}   opts.system        - System prompt (will be cached)
 * @param {Array}    opts.messages      - Conversation history in Anthropic format
 * @param {Array}    opts.tools         - Tool definitions (Anthropic tool_choice schema)
 * @param {Function} opts.tool_executor - async (name, input) => string|object
 * @param {string}   [opts.client_id]   - When set, token usage for this turn is
 *                                         metered against the client's monthly quota.
 * @returns {Promise<string>} Final text response from the assistant
 */
const run_turn = async ({ employee = 'default', system, messages, tools = [], tool_executor, client_id = null }) => {
  const model = MODELS[employee] ?? MODELS.default;

  let current_messages = [...messages];
  let iterations = 0;
  let acc_in = 0;
  let acc_out = 0;

  // Records this turn's accumulated token usage (+1 message) and returns the text.
  const finalize = async (text) => {
    await record_usage(client_id, { input_tokens: acc_in, output_tokens: acc_out });
    return text;
  };

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      // Cache the system prompt — it's identical across turns for the same client
      system: [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: current_messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    acc_in  += response.usage?.input_tokens  ?? 0;
    acc_out += response.usage?.output_tokens ?? 0;

    // Pure text response — we're done
    if (response.stop_reason === 'end_turn') {
      const text_block = response.content.find(b => b.type === 'text');
      return finalize(text_block?.text ?? '');
    }

    // Tool use — execute all requested tools and continue
    if (response.stop_reason === 'tool_use') {
      current_messages.push({ role: 'assistant', content: response.content });

      const results = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        let tool_output;
        try {
          tool_output = await tool_executor(block.name, block.input);
        } catch (err) {
          tool_output = { error: err.message ?? 'Tool execution failed' };
        }

        results.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     typeof tool_output === 'string'
            ? tool_output
            : JSON.stringify(tool_output),
        });
      }

      current_messages.push({ role: 'user', content: results });
      continue;
    }

    // Unexpected stop reason
    break;
  }

  // Fallback if loop exhausted without a clean end_turn
  const last_assistant = [...current_messages].reverse()
    .find(m => m.role === 'assistant');
  if (last_assistant) {
    const blocks = Array.isArray(last_assistant.content) ? last_assistant.content : [];
    const text   = blocks.find(b => b.type === 'text');
    if (text?.text) return finalize(text.text);
  }

  return finalize('Lo siento, no pude completar la solicitud en este momento.');
};

export { run_turn, MODELS };
