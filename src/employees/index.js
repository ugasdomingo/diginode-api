import recepcionista from './recepcionista/index.js';
import asistente from './asistente/index.js';
import gestor_relaciones from './gestor-relaciones/index.js';
import content_manager from './content-manager/index.js';

const EMPLOYEE_MODULES = {
  recepcionista,
  asistente,
  'gestor-relaciones': gestor_relaciones,
  'content-manager':   content_manager,
};

// Returns the module for a given employee slug, or null if not found.
const get_employee = (slug) => EMPLOYEE_MODULES[slug] ?? null;

// Returns only the employees active for a given client.
const get_active_employees = (active_employee_slugs = []) =>
  active_employee_slugs
    .map(slug => ({ slug, module: get_employee(slug) }))
    .filter(({ module }) => module !== null);

export { EMPLOYEE_MODULES, get_employee, get_active_employees };
