# Reposicionamiento de Diginode — entrega local

24 de octubre de 2026. Publicación expresamente fuera del alcance. No se ha hecho push, merge, despliegue, cobro ni envío de correo real.

## Referencias y punto de partida

- Plan: `docs/planes/PLAN_WEB_Y_API_DIGINODE.md` y modelo de negocio enlazado. Criterios de simplicidad y cambios concretos de `C:/Users/Usuario/Downloads/CLAUDE.md`.
- Cliente: base `8bd526c`, rama anterior `codex/diginode-empresa-unipersonal`. Solo había `docs/` sin seguimiento; sus dos Markdown y el DOCX se conservan ajenos al commit.
- API: base `63fe295`, sin cambios previos. El error de checkout era consecuencia de las restricciones de acceso del entorno: Git funcionó al acceder al repositorio autorizado fuera del sandbox. No hubo reset, borrado, modificación de configuración ni reescritura de historia.
- Rama de implementación en ambos repositorios: `codex/reposicionamiento-diginode`.

## Fases implementadas

1. Se conserva la antigua landing clínica en `/clinica-digital`, con precio del catálogo, contratación y enlaces a las páginas clínicas existentes. `/demo` y `/plan` tienen redirecciones permanentes en la configuración de alojamiento, además de compatibilidad en el router.
2. Catálogo de tres servicios y captación sobre `Lead`: validación, aviso de privacidad versionado, presupuesto mensual o de proyecto, antispam, límite de cuerpo y por IP, UUID persistente, conflicto si se reutiliza con otro contenido y avisos internos recuperables. La solicitud se guarda antes de avisar; un fallo de aviso no pierde el contacto.
3. Una Nora compartida en la SPA, con enfoque por página, aviso de IA, salida humana, agenda ficticia, botones autorizados y confirmación explícita del resumen por correo. El servidor fija destinatario y contenido; el modelo no puede enviar por sí solo. Los widgets antiguos conversan y reciben el resumen en pantalla. Límite de 15 turnos, bloqueo concurrente, máximo diario persistido y registro de tokens. Las acciones y cuotas se guardan en MongoDB, no en memoria del servidor.
4. Home para microempresas y pymes, dos escalas sin precios pendientes de validar, proceso y control de marca, sección clínica y sección de desarrollo. Landing de webs/aplicaciones con alcance, aceptación, propiedad, mantenimiento, terceros y ejemplo anónimo interactivo. Formulario compartido y responsive, sin alta ni cobro de gestión/proyectos.
5. Administración con búsqueda real y filtros, datos de la solicitud, notas y etapas coherentes; conversión automática desactivada para las nuevas líneas. Métricas de solicitudes, demos, reservas verificadas y ganados separadas de la navegación. Los eventos antiguos del taller se conservan. Reservas por email exacto; las ambiguas quedan señaladas para revisión humana.
6. SEO por ruta, canonical, Open Graph, datos estructurados, sitemap, robots y HTML comercial inicial con estilos. El build compila Vue para producción también al pre-renderizar: así coinciden los identificadores de CSS. No llama a IA, correo ni analítica. El catálogo versionado se compara con el de la API cuando ambos repositorios están presentes.

## Decisiones de simplicidad y compatibilidad

- Se reutilizan Vue/Vite, Express/MongoDB, `Lead`, el catálogo de clínica y el asistente existentes. No se añade CRM, framework, microservicio ni sistema de agentes.
- El correo de demostración usa un resumen comercial fijo por contexto, en lugar de permitir redactar y enviar contenido arbitrario. Es más sencillo de revisar y evita que la demo se convierta en un servicio de envío abierto.
- La demo de catálogo es anónima y local: no utiliza la marca Uniformes Ellas sin autorización ni atribuye ventas o resultados.
- El retorno de Stripe es informativo. No se considera pagado por una query ni se emite una compra desde la nueva Home. El webhook firmado conserva el alta y el registro de pago existentes. `CLINICA_RETURN_PATH` permite cambiar el retorno después de que esté disponible el cliente nuevo; por defecto mantiene `/`, que el nuevo router deriva a clínica.
- La publicidad permanece desactivada incluso con un ID de Pixel antiguo. La medición propia requiere activación explícita y revisión de su configuración; el build de revisión la habilita únicamente para probar datos ficticios.
- La conversación visible se mantiene en memoria de la SPA; solo el identificador de demo puede persistir en el navegador. Recargar la página no borra los límites del servidor.
- El portal conserva sus recorridos. Si no hay calendario configurado, ofrece correo humano en lugar de un enlace `#`.

## Verificación realizada

### Comprobaciones automáticas

- Baseline: lint del cliente sin errores (4 advertencias previas), build del cliente correcto; lint de API sin errores (1 advertencia previa) y 60 pruebas correctas.
- API modificada: lint sin errores y 77 pruebas correctas en 9 archivos (1 prueba de servidor interactivo omitida deliberadamente en la ejecución normal). Suite ampliada de integración sobre MongoDB efímero, con SDK de IA, correo, avisos y checkout simulados. Incluye concurrencia, idempotencia, conflictos de contenido, URLs malformadas, fallos de persistencia/aviso/correo/IA, confirmación de email, destinatario bloqueado, caducidad, cuotas entre IDs, reconexión de MongoDB, búsqueda, permisos de administración, etapas, reservas ambiguas, copia y comparación de conocimiento, webhook Stripe firmado e idempotente, portal y catálogo de formación.
- Cliente: lint sin errores; build normal y build de revisión; `npm run test:static` comprueba las tres páginas, contenido/formulario inicial, metadatos diferentes, canonical, Open Graph, JSON-LD, ficheros CSS y coincidencia de todos los identificadores de estilo de Vue.
- Advertencias previas conservadas: imports sin uso en `ClientsView.vue`, `ContentView.vue`, `PortalDashboardView.vue` y `conversations_controller.js`; deprecación Sass en `ContentView.vue`. No se reformatearon ni repararon módulos ajenos.

### Navegador integrado

Comprobado sobre el build local con proveedores simulados y datos `example.test`. Vista móvil de 390 px y escritorio de aproximadamente 1280 px; se comprobó el ancho real del documento y la ausencia de desbordamiento en las páginas comerciales. Esto no acredita dispositivos físicos ni integraciones de producción.

| Recorrido | Evidencia observada |
|---|---|
| Home → propuesta Pyme → formulario móvil | Escala Pyme preseleccionada, envío y acuse visible. |
| Home → formulario de escritorio | Solicitud guardada y acuse visible. |
| Desarrollo, móvil y escritorio | Catálogo identificado como simulación, servicio preseleccionado y solicitud recibida. |
| Formulario con API caída → reintento | Error visible, campos conservados y acuse al recuperar el servicio. |
| Nora en las tres líneas | Respuestas acordes con marca, proyecto o consulta; conversación conservada al navegar por la SPA. |
| Agenda y correo de Nora | Agenda ficticia, vista previa de destinatario/resumen y confirmación antes de invocar al proveedor simulado. |
| Límite de Nora | Quince turnos aceptados; el siguiente muestra límite y contacto humano. |
| Clínica, móvil y escritorio | Apertura del checkout simulado, evento firmado y retorno informativo a `/clinica-digital?compra=pendiente`. |
| URLs antiguas | `/demo` llega a `/clinica-digital#demo-nora`; `/plan` llega a `/clinica-digital`. |
| Administración | Solicitud móvil visible, búsqueda filtrada por servidor, cambio de estado, notas y métricas separadas. |
| Formación y portal | Inscripción gratuita de cuenta existente, aforo actualizado, aviso para entrar con sus credenciales, detalles de la formación, compras y soporte. |

## Cómo revisar localmente

Requisitos: Node.js y dependencias instaladas con `npm ci` en cada repositorio. La primera ejecución de las pruebas puede descargar el binario de MongoDB para la base efímera. No se necesita el `.env` real para esta revisión.

En una terminal dentro de `diginode-api`:

```powershell
npm run review
```

Esperar `LOCAL_REVIEW_READY http://127.0.0.1:3107`. En otra terminal, dentro de `diginode-client`:

```powershell
npm run review:build
npm run test:static
npm run review
```

Abrir `http://localhost:4173`. El servidor estático reproduce las rutas del `vercel.json` local. Usar `/`, `/webs-y-aplicaciones`, `/clinica-digital`, `/demo`, `/plan`, `/login` y `/formacion/ia-para-terapeutas`.

Cuentas exclusivamente ficticias del entorno efímero: `admin@example.test` y `client@example.test`; contraseña `local-review-only`. El checkout anuncia que es simulado. Los correos no salen del proceso. Ctrl+C detiene los servidores; al cerrar la API de revisión se descartan sus datos efímeros. Si recompilas mientras navegas, recarga las pestañas para usar el nuevo conjunto de assets.

Comprobaciones repetibles:

```powershell
# Cliente
npm run lint
npm run build
npm run test:static
# API, en su directorio
npm run lint
npm test
```

La API ejecuta JavaScript directamente: no tenía ni necesita un comando de compilación. Sus pruebas importan la aplicación y verifican los módulos modificados.

## Pendiente exclusivamente de publicación y validación externa

1. Completar con datos reales la identidad, NIF, domicilio y demás información del responsable; validar privacidad, conservación y condiciones. No se han inventado. La conservación general de conversaciones no incorpora un borrado automático nuevo: debe fijarse y aplicarse la política real antes de publicar.
2. Confirmar las condiciones comerciales, los presupuestos y quién será el interlocutor. Los importes propuestos de gestión/desarrollo y las garantías no se publican. La clínica mantiene el catálogo vigente; cualquier cambio de precio exige regenerar y revisar el snapshot, HTML y textos de las páginas clínicas existentes.
3. Comparar y exportar el conocimiento editable de la base del entorno elegido antes de aplicarlo. No se ha accedido a MongoDB de producción. El script de actualización exige URI de revisión explícita, copia nueva y hash exacto; no carga `.env` ni sobrescribe a ciegas.
4. Verificar en ensayo real las credenciales, dominio de correo, enlace de Cal.com, avisos internos, Stripe test y webhooks. La simulación local no acredita disponibilidad ni entrega real de esos proveedores. La prueba de compra local nunca utiliza tarjetas ni cobra.
5. Confirmar permisos para crear los índices no destructivos nuevos y revisar límites/retención. Las cuotas diarias usan UTC; el máximo predeterminado es 300 turnos de demo. Avisos pendientes se reintentan cada cinco minutos, hasta 20 intentos, y siguen visibles si no se entregan.
6. Mantener Pixel apagado; decidir y validar la activación de medición propia y su sal. Revisar el evento legado `purchase` del taller como inscripción cuando la formación es gratuita, sin convertirlo en venta de gestión.
7. El catálogo de formación conserva la convocatoria existente del 3 de octubre de 2026. Confirmar cierre o siguiente convocatoria antes de anunciarla; no se ha inventado otra fecha ni alterado esa campaña.
8. Publicar, solo con autorización posterior, API compatible → cliente → retorno nuevo de Stripe. Guardar referencias anteriores y exportación de conocimiento; si se revierte el cliente, conservar API compatible y los leads recibidos. Revisar alojamiento, previews sociales y Search Console tras publicar; no se promete conservar rankings.

Referencias técnicas consultadas: [SSR de Vite](https://vite.dev/guide/ssr), [configuración de Vercel](https://vercel.com/docs/project-configuration) y [condiciones de medición de audiencia de la AEPD](https://www.aepd.es/guias/guia-cookies-analiticas-externas.pdf).
