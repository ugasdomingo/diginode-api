import ContentGrid from '../models/content_grid_model.js';
import { generate_image } from './gemini_service.js';

// Generates an image for a content grid post and stores the base64 data URL.
// For production, replace the base64 data URL with an upload to Cloudinary or Google Drive.
const design_post = async (content_id) => {
  const post = await ContentGrid.findById(content_id);

  if (!post) {
    const err = new Error('Content post not found');
    err.status_code = 404;
    throw err;
  }

  if (!post.image_prompt) {
    const err = new Error('Post has no image_prompt to generate from');
    err.status_code = 400;
    throw err;
  }

  const { data, mime_type } = await generate_image(post.image_prompt);

  // Store as a data URL so the frontend can render it immediately.
  // TODO: Upload to Cloudinary/Google Drive and store the CDN URL instead.
  const image_url = `data:${mime_type};base64,${data}`;

  post.image_url = image_url;
  await post.save();

  return post;
};

export { design_post };
