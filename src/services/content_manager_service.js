import ContentGrid from '../models/content_grid_model.js';
import { generate_json } from './gemini_service.js';
import { CONTENT_MANAGER_PROMPT } from '../utils/prompts.js';

const CONTENT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      day: { type: 'integer' },
      platform: { type: 'string' },
      copy: { type: 'string' },
      image_prompt: { type: 'string' },
    },
    required: ['day', 'platform', 'copy', 'image_prompt'],
  },
};

// Generates a 7-day content grid for the given theme and saves it as drafts
const generate_content_grid = async (theme) => {
  const posts = await generate_json(
    CONTENT_MANAGER_PROMPT,
    `Generate a 7-day content grid for the following theme: "${theme}"`,
    CONTENT_SCHEMA,
    'pro'
  );

  const week_start = get_monday_of_current_week();

  const docs = posts.map((post) => ({
    theme,
    platform: post.platform,
    copy: post.copy,
    image_prompt: post.image_prompt,
    scheduled_for: add_days(week_start, post.day - 1),
    week_start,
    status: 'draft',
  }));

  return ContentGrid.insertMany(docs);
};

const get_monday_of_current_week = () => {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const add_days = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export { generate_content_grid };
