// Explicit review URI only. Never loads the production .env file.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import Knowledge from '../src/models/knowledge_model.js';
import { NORA_DEMO_KB } from '../src/config/nora_kb.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function run() {
  if (!process.env.NORA_KB_REVIEW_URI)
    throw new Error(
      'Set NORA_KB_REVIEW_URI explicitly for the intended review database. No .env is loaded.'
    );
  await mongoose.connect(process.env.NORA_KB_REVIEW_URI);
  try {
    const current = await Knowledge.findOne({ key: 'nora_demo' }).lean();
    const current_hash = hash(current?.content ?? '');
    console.log(
      JSON.stringify({
        current_hash,
        proposed_hash: hash(NORA_DEMO_KB),
        current_length: current?.content?.length ?? 0,
        proposed_length: NORA_DEMO_KB.length,
        changed: current?.content !== NORA_DEMO_KB,
      })
    );
    const backup = process.argv.find((arg) => arg.startsWith('--backup='))?.slice(9);
    if (backup)
      await fs.writeFile(
        backup,
        JSON.stringify(
          { captured_at: new Date().toISOString(), hash: current_hash, document: current },
          null,
          2
        ),
        { flag: 'wx' }
      );
    const apply = process.argv.find((arg) => arg.startsWith('--apply='))?.slice(8);
    if (!apply) return;
    if (!backup || apply !== current_hash)
      throw new Error('Apply requires a new backup file and the exact hash from the comparison.');
    if (current) {
      const result = await Knowledge.updateOne(
        { _id: current._id, content: current.content },
        { $set: { content: NORA_DEMO_KB } }
      );
      if (result.matchedCount !== 1)
        throw new Error('Knowledge changed since comparison; nothing overwritten.');
    } else await Knowledge.create({ key: 'nora_demo', content: NORA_DEMO_KB });
    console.log('Reviewed knowledge applied.');
  } finally {
    await mongoose.disconnect();
  }
}
run().catch(() => {
  console.error(
    'Knowledge review failed. Check database availability, backup path and comparison hash.'
  );
  process.exitCode = 1;
});
