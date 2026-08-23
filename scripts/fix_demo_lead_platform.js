// Corrige los leads de la demo de Nora que quedaron etiquetados como 'whatsapp'.
//
// Durante meses el componente de la web no enviaba la plataforma y el esquema
// asumía 'whatsapp' por defecto, así que el tráfico de la demo web se contó
// como WhatsApp. Ya está corregido de cara al futuro; esto arregla lo pasado.
//
//   node scripts/fix_demo_lead_platform.js          → muestra qué haría
//   node scripts/fix_demo_lead_platform.js --apply  → aplica los cambios
import 'dotenv/config';
import connect_db from '../src/config/db.js';
import Lead from '../src/models/lead_model.js';

const APPLY = process.argv.includes('--apply');

const run = async () => {
  await connect_db();

  // Los contact_id de la demo web siempre empiezan por 'demo-'.
  const filtro = { platform: 'whatsapp', contact_id: /^demo-/ };
  const afectados = await Lead.find(filtro).select('contact_id created_at').lean();

  if (afectados.length === 0) {
    console.log('No hay leads que corregir.');
    process.exit(0);
  }

  console.log(`${afectados.length} leads de la demo web etiquetados como WhatsApp:`);
  for (const l of afectados) {
    console.log(`  ${l.contact_id}  (${new Date(l.created_at).toLocaleDateString('es-ES')})`);
  }

  if (!APPLY) {
    console.log('\nEnsayo. Vuelve a ejecutarlo con --apply para corregirlos.');
    process.exit(0);
  }

  const r = await Lead.updateMany(filtro, { $set: { platform: 'website' } });
  console.log(`\nCorregidos: ${r.modifiedCount}.`);
  process.exit(0);
};

run().catch((err) => {
  console.error('fix_demo_lead_platform falló:', err.message);
  process.exit(1);
});
