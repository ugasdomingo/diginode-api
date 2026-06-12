// Ensures the demo Client exists in the DB (idempotent).
// Run once per environment:  node scripts/seed_demo_client.js
import 'dotenv/config';
import connect_db from '../src/config/db.js';
import Client from '../src/models/client_model.js';

const DEMO_EMAIL = 'demo@diginode.local';

const run = async () => {
  await connect_db();

  const existing = await Client.findOne({ email: DEMO_EMAIL });
  if (existing) {
    console.log(`Demo client already present (${existing._id}). Nothing to do.`);
    process.exit(0);
  }

  const client = await Client.create({
    name:             'Fisio Activa (Demo)',
    email:            DEMO_EMAIL,
    company:          'Fisio Activa',
    plan:             'entrepreneur',
    status:           'active',
    active_employees: ['recepcionista'],
    office_status:    'not_requested',
  });

  console.log(`Demo client created: ${client._id}`);
  process.exit(0);
};

run().catch((err) => {
  console.error('seed_demo_client failed:', err.message);
  process.exit(1);
});
