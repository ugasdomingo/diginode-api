import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { create_operations_seed } from './seed.js';

// Local-only adapter: one writer, serialized atomic commits, rollback on failure.
// This is deliberately not a database/authentication substitute for production.
export async function create_local_store(filename = null) {
  let state;
  let lock;
  if (filename) {
    await mkdir(dirname(filename), { recursive: true });
    try {
      lock = await open(`${filename}.lock`, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(`${filename}.lock`, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Bloqueo local inválido. Revisar el archivo de bloqueo.', { cause: error });
      let alive = true;
      try { process.kill(pid, 0); } catch (probe) { if (probe.code === 'ESRCH') alive = false; }
      if (alive) throw new Error('Ya hay otro proceso usando el laboratorio local.', { cause: error });
      await unlink(`${filename}.lock`);
      lock = await open(`${filename}.lock`, 'wx');
    }
    await lock.writeFile(String(process.pid));
    try {
      state = JSON.parse(await readFile(filename, 'utf8'));
      const collections = ['businesses', 'contacts', 'messages', 'appointments', 'contents', 'jobs', 'deliveries', 'audit', 'usage', 'payments'];
      if (state.version !== 1 || !collections.every((key) => Array.isArray(state[key]))) throw new Error('Formato del laboratorio inválido. Los datos no se han sobrescrito.');
    } catch (error) {
      if (error.code !== 'ENOENT') { await lock.close(); await unlink(`${filename}.lock`); throw error; }
      state = create_operations_seed();
      await writeFile(filename, JSON.stringify(state), { mode: 0o600 });
    }
  } else state = create_operations_seed();
  let queue = Promise.resolve();
  let closed = false;
  return {
    read: () => structuredClone(state),
    transact(mutate) {
      const action = queue.then(async () => {
        if (closed) throw new Error('El almacén está cerrado.');
        const draft = structuredClone(state);
        const result = await mutate(draft);
        draft.revision += 1;
        if (filename) {
          await writeFile(`${filename}.tmp`, JSON.stringify(draft), { mode: 0o600 });
          await rename(`${filename}.tmp`, filename);
        }
        state = draft;
        return structuredClone(result);
      });
      queue = action.catch(() => {});
      return action;
    },
    async close() {
      await queue;
      closed = true;
      if (lock) { await lock.close(); await unlink(`${filename}.lock`); lock = null; }
    },
  };
}
