// Updates the nora_demo knowledge base with full content about employees and plans.
// Run once: node scripts/update_nora_kb.js
// Safe to re-run: always overwrites to the latest content.
import 'dotenv/config';
import connect_db from '../src/config/db.js';
import Knowledge from '../src/models/knowledge_model.js';

const CONTENT = `
QUÉ ES DIGINODE
DigiNode crea empleados con IA para negocios que trabajan solos o en equipos pequeños: profesionales independientes, consultas, despachos y clínicas. El producto insignia es el Plan Entrepreneur: web profesional, panel de gestión y 2 empleados con IA (Nora + Alex), todo configurado en unos días. 300 euros al mes, sin permanencia y con 14 días de garantía. Si no ahorra tiempo, se devuelve el mes.

EMPLEADOS CON IA — QUÉ HACE CADA UNO

NORA (La Recepcionista)
Nora atiende WhatsApp e Instagram 24/7. Responde en segundos a cualquier hora, resuelve las dudas más frecuentes de los clientes, agenda y recuerda citas, y filtra lo urgente para avisarte solo cuando de verdad hace falta. Habla con el tono del negocio. Es perfecta para cualquier profesional que recibe consultas o reservas por mensajes.

ALEX (El Asistente)
Alex es un asistente de operaciones que ayuda a gestionar el día a día desde el panel. Redacta respuestas, resume conversaciones, prepara informes sencillos y apoya en tareas administrativas repetitivas. Trabaja en el panel interno, no de cara al cliente.

VALERIA (La Content Manager)
Valeria genera grillas de contenido semanales para redes sociales: Instagram, LinkedIn, TikTok y Twitter/X. Dado un tema o producto, devuelve 7 posts con copy listo para publicar y una descripción de imagen para cada uno. Ideal para mantener presencia en redes sin dedicarle horas.

MARCOS (El Analista de Ventas)
Marcos analiza transcripciones de reuniones de ventas y extrae lo más importante: nombre del cliente, empresa, puntos de dolor, solución propuesta, próximos pasos y plan recomendado. Convierte notas desordenadas en fichas estructuradas en segundos.

PLANES Y PRECIOS

Plan Entrepreneur — 300 euros/mes (el plan insignia)
Incluye: web profesional + panel de gestión + Nora (recepcionista) + Alex (asistente). Sin permanencia. Con 14 días de garantía. Puesta en marcha en aproximadamente 7 días. Es el plan recomendado para la mayoría de solopreneurs y profesionales independientes.

Plan Individual — 180 euros/mes
Un solo empleado con IA a elegir, sin web ni panel incluidos. Pensado para quien ya tiene su propia web o quiere empezar con un único empleado antes de dar el salto al Plan Entrepreneur.

Plan Clínica — 500 euros/mes
Diseñado para clínicas y consultas con mayor volumen de citas y consultas. Incluye Nora configurada para el sector salud, mayor capacidad de mensajes y soporte prioritario.

CÓMO EMPIEZA UN CLIENTE
1. Prueba a Nora en la demo (esto que estás haciendo ahora mismo).
2. Agenda una reunión gratuita con el equipo de DigiNode para ver si encaja con su negocio.
3. Si decide seguir adelante, se contrata el Plan Entrepreneur y en unos días está todo funcionando.

PREGUNTAS FRECUENTES

¿Hay permanencia?
No. Se puede cancelar en cualquier momento. Sin letra pequeña.

¿Qué pasa si no estoy satisfecho?
Los primeros 14 días tienen garantía: si Nora no ahorra tiempo real, se devuelve el mes sin preguntas.

¿Cuánto tarda en estar listo?
Aproximadamente 7 días desde que se firma hasta que Nora está atendiendo clientes.

¿Funciona con mi WhatsApp actual?
Sí, se conecta al número de WhatsApp Business del negocio. No hay que cambiar de número ni de aplicación.

¿Puedo personalizar lo que sabe Nora?
Sí. Desde el panel de gestión puedes editar en cualquier momento la base de conocimiento que usa Nora para responder: precios, servicios, horarios, tono, lo que necesites.

¿Nora habla en mi idioma?
Nora responde en el idioma en que le escribe el cliente: español, inglés, francés, etc.
`.trim();

const run = async () => {
  await connect_db();
  await Knowledge.findOneAndUpdate(
    { key: 'nora_demo' },
    { content: CONTENT },
    { upsert: true },
  );
  console.log('nora_demo knowledge base updated.');
  process.exit(0);
};

run().catch((err) => {
  console.error('update_nora_kb failed:', err.message);
  process.exit(1);
});
