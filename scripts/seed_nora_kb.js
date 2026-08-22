// Crea la base de conocimiento de la demo de Nora (key 'nora_demo') si aún no
// existe, con el contenido de src/config/nora_kb.js.
//   node scripts/seed_nora_kb.js
// Idempotente: si ya existe no la toca, para no pisar las ediciones del admin.
// Para forzar la actualización, usa scripts/update_nora_kb.js.
import 'dotenv/config';
import connect_db from '../src/config/db.js';
import Knowledge from '../src/models/knowledge_model.js';
import { NORA_DEMO_KB } from '../src/config/nora_kb.js';

const run = async () => {
  await connect_db();

  const existing = await Knowledge.findOne({ key: 'nora_demo' });
  if (existing) {
    console.log('nora_demo ya existe — no se toca. Usa update_nora_kb.js para sobrescribirla.');
    process.exit(0);
  }

  await Knowledge.create({ key: 'nora_demo', content: NORA_DEMO_KB });
  console.log('nora_demo creada.');
  process.exit(0);
};

run().catch((err) => {
  console.error('seed_nora_kb falló:', err.message);
  process.exit(1);
});
