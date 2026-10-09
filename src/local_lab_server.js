// Explicit local entrypoint. No dotenv, production app, SDKs or network providers.
import { fileURLToPath } from 'node:url';
import { create_local_store } from './operations/local_store.js';
import { create_operations_service } from './operations/service.js';
import { create_lab_app } from './operations/local_app.js';

if (process.env.NODE_ENV === 'production') throw new Error('El laboratorio no puede arrancar en producción.');
const store = await create_local_store(fileURLToPath(new URL('../.local-lab/state.json', import.meta.url)));
const service = create_operations_service(store);
const app = create_lab_app(service);
const server = app.listen(3001, '127.0.0.1', () => {
  console.log('Laboratorio Diginode: http://127.0.0.1:3001 — proveedores externos desactivados');
});
let processing = false;
const timer = setInterval(async () => {
  if (processing) return;
  processing = true;
  try { for (const org of store.read().businesses) await service.process_jobs(org.id); }
  catch { console.error('No se pudieron procesar los trabajos del laboratorio.'); }
  finally { processing = false; }
}, 5000);
let shutting_down = false;
async function shutdown() {
  if (shutting_down) return; shutting_down = true;
  clearInterval(timer); server.close(); await store.close();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
server.on('error', async () => { clearInterval(timer); await store.close(); console.error('No se pudo abrir el puerto local 3001.'); process.exitCode = 1; });
