// ── Base de conocimiento de Nora (demo pública, key 'nora_demo') ───────────
// Fuente única del contenido que Nora usa para responder en la demo. Los dos
// scripts de scripts/ la escriben en Mongo; antes cada uno llevaba su propia
// copia y acabaron contradiciéndose, así que el texto vive aquí y solo aquí.
//
// Los precios y las fechas se interpolan desde config/plans.js y
// config/trainings.js: si cambia el precio, basta con volver a ejecutar
//   node scripts/update_nora_kb.js
// y la base de conocimiento queda al día sin reescribir nada a mano.
//
// Ojo: el admin (Conocimiento) permite editar este texto en caliente. Ejecutar
// el script de update sobrescribe esas ediciones.
import { PLANS, EMPLOYEE_NAMES } from './plans.js';
import { TRAININGS } from './trainings.js';

const clinica = PLANS.clinica;
const taller = TRAININGS['ia-para-terapeutas'];

const fecha_taller = new Date(`${taller.date}T00:00:00`).toLocaleDateString('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export const NORA_DEMO_KB = `
QUÉ ES DIGINODE
DigiNode monta la presencia digital completa de psicólogos, coaches y terapeutas
y le pone dentro "empleados con IA" que trabajan solos. No es una agencia por
horas ni una herramienta que el profesional tenga que aprender a usar: se entrega
funcionando, configurado para su consulta.

EL PRODUCTO: ${clinica.name.toUpperCase()}
Un único producto, sin versiones ni extras que elegir: una página web profesional
más ${clinica.employees_included} empleados con IA, por ${clinica.monthly} euros
al mes. Sin pago de instalación y sin permanencia: se puede cancelar cuando se
quiera. La puesta en marcha son unos 7 días.

Al completar 12 cuotas, la web y los empleados pasan a ser propiedad del cliente.
Y desde el primer día, el dominio y los datos de sus pacientes ya son suyos: si
un día se va, se lleva su negocio con él.

LOS TRES EMPLEADOS INCLUIDOS

${EMPLOYEE_NAMES.recepcionista} (la recepcionista) — soy yo
Atiendo WhatsApp e Instagram las 24 horas. Respondo en segundos a cualquier hora,
resuelvo las dudas habituales de los pacientes, agendo y recuerdo las citas, y
filtro lo que de verdad necesita la atención del terapeuta. Hablo con el tono de
su consulta y nunca me invento datos ni precios.

${EMPLOYEE_NAMES.asistente} (el auxiliar técnico)
Vigila que todo siga funcionando: revisa la web y las integraciones, avisa de
incidencias y resuelve los problemas técnicos antes de que el terapeuta los note.

${EMPLOYEE_NAMES['content-manager']} (la creadora de contenido)
Prepara el contenido para las redes y el blog de la consulta: publicaciones
listas para usar, con su texto y su propuesta de imagen, para mantener presencia
sin dedicarle horas.

TALLER DE ENTRADA: ${taller.name.toUpperCase()}
Para quien prefiere empezar aprendiendo antes que contratando, hay un taller
online en directo:
- Cuándo: ${fecha_taller}, a las ${taller.time}, hasta las 16:00 con pausa para comer.
- Dónde: online por ${taller.platform}.
- Precio: ${taller.price} euros. Aparte, durante el taller se usan herramientas
  de IA que cada asistente contrata con su propia cuenta (unos 25 euros).
- Plazas: solo ${taller.capacity}, es un grupo reducido en directo.
- Dónde se reserva: en midiginode.com/formacion/ia-para-terapeutas
En el taller se aprende a quitarse de encima las tareas repetitivas y a montar el
propio sistema con empleados IA. Es la puerta de entrada barata; la Clínica
Digital es para quien quiere que se lo montemos nosotros y funcione solo.

CÓMO EMPIEZA UN CLIENTE
1. Prueba a Nora en la demo (esto que estás haciendo ahora mismo).
2. Compra la Clínica Digital directamente desde la web, o reserva una plaza en el
   taller si prefiere empezar por ahí, o agenda una reunión si quiere hablar
   antes con una persona.
3. Rellena un formulario corto con la información de su consulta.
4. En unos 7 días lo tiene todo funcionando.

PREGUNTAS FRECUENTES

¿Hay permanencia?
No. Se cancela cuando se quiera, sin letra pequeña.

¿Qué incluye exactamente los ${clinica.monthly} euros al mes?
La página web profesional y los tres empleados con IA (${EMPLOYEE_NAMES.recepcionista},
${EMPLOYEE_NAMES.asistente} y ${EMPLOYEE_NAMES['content-manager']}), más el
mantenimiento y las mejoras mientras dure la suscripción. No hay coste de
instalación.

¿Qué es eso de que es mía al completar 12 cuotas?
Es un alquiler con opción a compra: al pagar la cuota número 12, la web y los
empleados quedan en propiedad del cliente. El dominio y los datos de sus
pacientes son suyos desde el primer día, no desde el mes doce.

¿Cuánto tarda en estar listo?
Unos 7 días desde que se contrata hasta que la web está publicada y los empleados
atendiendo.

¿Funciona con mi WhatsApp actual?
Sí, se conecta al número de WhatsApp Business de la consulta. No hay que cambiar
de número ni de aplicación.

¿Y si contesta algo que yo no firmaría?
El terapeuta define qué puedo decir y cuándo tengo que pasarle la conversación a
él. Nunca doy consejo clínico: para eso está el profesional.

¿Puedo cambiar lo que sabe Nora?
Sí. Desde el panel se edita en cualquier momento lo que respondo: servicios,
horarios, precios, tono.

¿En qué idioma atiende Nora?
Respondo en el idioma en el que me escriban: español, inglés, francés…

¿Esto sirve si aún no tengo consulta montada o tengo pocos pacientes?
Sí, y de hecho es de lo que más nos escriben. La web y la recepcionista trabajan
para conseguir y atender pacientes; no hace falta tener la agenda llena para
empezar.
`.trim();

export default NORA_DEMO_KB;
