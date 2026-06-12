// Seeds the default knowledge base Nora uses in the public demo (key 'nora_demo').
// Editable afterwards from the admin (Conocimiento). Idempotent: only creates it
// if it doesn't exist yet, so it won't overwrite your edits.
//   node scripts/seed_nora_kb.js
import 'dotenv/config';
import connect_db from '../src/config/db.js';
import Knowledge from '../src/models/knowledge_model.js';

const DEFAULT_CONTENT = `
QUÉ ES DIGINODE
DigiNode crea "empleados con IA" para negocios que atienden solos: profesionales,
consultas y pequeños equipos. El producto insignia es el Plan Entrepreneur: una web
profesional, un panel de gestión y 2 empleados con IA (Nora, la recepcionista, y
Alex, el asistente), todo configurado en unos días. 300€/mes, sin permanencia y con
14 días de garantía.

QUÉ HACE NORA (LA RECEPCIONISTA)
- Atiende WhatsApp e Instagram 24/7, responde en segundos a cualquier hora.
- Resuelve dudas frecuentes de clientes con la información del negocio.
- Agenda, confirma y recuerda citas.
- Filtra lo urgente y avisa al dueño solo cuando hace falta.
- Habla con el tono del negocio; nunca inventa datos ni precios.

QUÉ OBTIENE EL CLIENTE SI CONTRATA
- Web profesional + panel de gestión incluidos.
- Nora (recepcionista) + Alex (asistente) trabajando 24/7.
- Puesta en marcha en ~7 días, sin migrar de herramienta.
- Sin permanencia y con 14 días de garantía: si no le ahorra tiempo, se le devuelve el mes.

CÓMO EMPIEZA
Agendando una reunión de demo gratuita con el equipo, o contratando directamente el
Plan Entrepreneur desde la web.
`.trim();

const run = async () => {
  await connect_db();

  const existing = await Knowledge.findOne({ key: 'nora_demo' });
  if (existing) {
    console.log('nora_demo knowledge already exists. Leaving it untouched.');
    process.exit(0);
  }

  await Knowledge.create({ key: 'nora_demo', content: DEFAULT_CONTENT });
  console.log('Seeded nora_demo knowledge base.');
  process.exit(0);
};

run().catch((err) => {
  console.error('seed_nora_kb failed:', err.message);
  process.exit(1);
});
