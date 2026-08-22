// Sobrescribe la base de conocimiento de la demo de Nora (key 'nora_demo') con
// el contenido vigente de src/config/nora_kb.js.
//   node scripts/update_nora_kb.js
// Seguro de re-ejecutar. OJO: pisa las ediciones hechas desde el admin.
import 'dotenv/config';
import connect_db from '../src/config/db.js';
import Knowledge from '../src/models/knowledge_model.js';
import { NORA_DEMO_KB } from '../src/config/nora_kb.js';

const run = async () => {
  await connect_db();
  await Knowledge.findOneAndUpdate(
    { key: 'nora_demo' },
    { content: NORA_DEMO_KB },
    { upsert: true },
  );
  console.log(`nora_demo actualizada (${NORA_DEMO_KB.length} caracteres).`);
  process.exit(0);
};

run().catch((err) => {
  console.error('update_nora_kb falló:', err.message);
  process.exit(1);
});
