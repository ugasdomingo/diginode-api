import { GoogleGenerativeAI } from '@google/generative-ai';

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model names come from env so they're easy to upgrade without code changes
const MODELS = {
  flash: process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash',
  pro: process.env.GEMINI_PRO_MODEL || 'gemini-2.0-pro',
  image: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp',
};

// Conversational text generation with optional history
const generate_text = async (system_prompt, user_message, history = [], model_key = 'flash') => {
  const model = client.getGenerativeModel({
    model: MODELS[model_key],
    systemInstruction: system_prompt,
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(user_message);
  return result.response.text();
};

// Forces a JSON response validated against a schema
const generate_json = async (system_prompt, user_message, schema, model_key = 'pro') => {
  const model = client.getGenerativeModel({
    model: MODELS[model_key],
    systemInstruction: system_prompt,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });

  const result = await model.generateContent(user_message);
  const text = result.response.text();
  return JSON.parse(text);
};

// Generates an image and returns base64 data + mime type
const generate_image = async (prompt) => {
  const model = client.getGenerativeModel({
    model: MODELS.image,
    generationConfig: { responseModalities: ['IMAGE'] },
  });

  const result = await model.generateContent(prompt);
  const candidates = result.response.candidates || [];

  for (const candidate of candidates) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return {
          data: part.inlineData.data,       // base64-encoded image
          mime_type: part.inlineData.mimeType,
        };
      }
    }
  }

  throw new Error('No image returned by the model');
};

export { generate_text, generate_json, generate_image };
