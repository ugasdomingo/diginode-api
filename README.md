# diginode
Repositorio para la nueva versión de DigiEmpresas

## Núcleo operativo de la agencia

La API pública (leads de la web, talleres, Clínica, portal) no cambia de sitio. Lo nuevo vive en `/api/agency` y se apoya en los mismos clientes, leads, usuarios y en el webhook de Stripe que ya existía.

Hay tres formas de entrar:

- **Domingo (admin).** `POST /api/auth/login` con email y contraseña. Recibe el token de siempre.
- **Cliente.** El mismo login comprueba la contraseña y responde `{ requires_otp, challenge_id }` sin token. El código de 6 dígitos llega por correo y caduca a los 10 minutos. `POST /api/auth/otp/verify` con `{ challenge_id, code }` devuelve el token. `POST /api/auth/otp/resend` manda otro y anula el anterior. Cinco fallos queman ese código. Para volver al login de un solo paso (solo si el portal todavía no pide el código) pon `CLIENT_2FA_REQUIRED=false`.
- **Bot.** Domingo crea una clave en `POST /api/agency/keys` (se muestra una sola vez, empieza por `dnk_`). El bot la manda en `Authorization: Bearer` o en `X-Api-Key`. Cada clave lleva permisos concretos (`leads:write`, `pieces:write`, `vault:read`…) y se revoca con `DELETE /api/agency/keys/:id`. Una clave no puede aprobar en nombre de Domingo ni del cliente.

### Pipeline de prospectos

El lead de siempre sigue teniendo su `status` comercial. El trabajo de la agencia va en `pipeline_status`:

| Valor | Significa |
|---|---|
| `nuevo` | nuevo |
| `analizado` | analizado |
| `pieza_lista` | pieza lista |
| `pendiente_de_aprobacion` | pendiente de aprobación |
| `contactado` | contactado |
| `respondio` | respondió |
| `reunion_visita` | reunión/visita |
| `ganado` | ganado |
| `perdido` | perdido |

Casi todo es opcional. Para abrir un prospecto basta el nombre del negocio (`business`). El historial (`mensaje_enviado`, `pieza_enviada`, `respuesta`, `nota`, `siguiente_accion`) guarda un resumen de hasta 500 caracteres, no el mensaje entero.

### Endpoints

Todos responden `{ success, data }` y piden un token o una clave, salvo el login.

| Método y ruta | Quién | Para qué |
|---|---|---|
| `GET/POST /api/agency/leads` | admin, bot | listar y crear prospectos |
| `GET/PATCH /api/agency/leads/:id` | admin, bot | ficha y cambios |
| `POST /api/agency/leads/:id/activity` | admin, bot | anotación, mensaje, respuesta o siguiente acción |
| `GET/POST /api/agency/clients` | admin; el cliente solo se ve a sí mismo | ficha de cliente |
| `GET/PATCH /api/agency/clients/:id` | admin escribe; cliente y bot leen | marca, paquete, bot responsable, KPIs, enlaces |
| `GET /api/agency/clients/:id/snapshot` | admin, cliente, bot | una sola lectura: marca, estrategia, piezas vivas y KPIs |
| `POST /api/agency/clients/:id/portal-access` | admin | crea el usuario del portal y enseña la contraseña temporal una vez |
| `GET/POST /api/agency/pieces` | admin y bot escriben; el cliente lee las suyas | piezas (el contenido vive en Drive/Docs) |
| `POST /api/agency/pieces/:id/versions` | admin, bot | nueva versión, solo en borrador |
| `POST /api/agency/pieces/:id/submit` | admin, bot | manda la pieza a aprobación |
| `GET /api/agency/approvals` | admin, cliente, bot | cola y auditoría |
| `POST /api/agency/approvals/:id/domingo` | admin | `{ decision: aprobar \| rechazar, comment }` |
| `POST /api/agency/approvals/:id/client` | cliente | igual, en su segunda fase |
| `GET/POST /api/agency/reports` | admin escribe; cliente lee | informe mensual (`period` = `YYYY-MM`) y enlace al Doc |
| `GET/POST /api/agency/meetings` | admin, bot; cliente lee las suyas | reuniones |
| `GET/POST /api/agency/invoices` | admin, bot; cliente lee las suyas | facturas en euros |
| `POST /api/agency/invoices/:id/checkout` | admin, bot | enlace de Stripe Checkout (modo test si la clave es `sk_test_`) |
| `POST /api/agency/clients/:id/credentials` | admin, cliente, bot con `vault:write` | guarda un acceso cifrado |
| `POST /api/agency/credentials/:id/decrypt` | admin o bot con `vault:read` | descifra. Cada lectura queda en el audit |
| `GET /api/agency/clients/:id/credential-audit` | admin | quién creó, leyó o borró accesos |
| `GET/POST/PATCH/DELETE /api/agency/keys` | admin | claves de bot |
| `GET /api/agency/events` | admin, bot | avisos ya emitidos |
| `GET/DELETE /api/agency/privacy/leads/:id` | admin | exportar o borrar datos personales del lead |
| `GET/DELETE /api/agency/privacy/clients/:id` | admin | exportar o borrar datos personales del cliente |

El webhook de Stripe no es nuevo: `POST /api/webhooks/stripe`. Si la sesión es de una factura de agencia y el importe cobrado coincide, la factura pasa a `pagada` y se copia el pago. Si no coincide, queda en `revision` y no se da por cobrada.

### Flujo de aprobación

1. El bot crea la pieza con el enlace de Drive o Docs y la envía (`submit`). Queda en **pendiente de Domingo**. Si la pieza es de un cliente, el circuito es de dos fases. Si solo cuelga de un prospecto, basta Domingo.
2. Domingo **aprueba** y la pieza pasa a **pendiente del cliente**. Si **rechaza**, hace falta un comentario: la pieza vuelve a borrador (`devuelto`) y el bot autor tiene que corregirla.
3. El cliente **aprueba** (pieza aprobada; ya se puede marcar como publicada) o **rechaza con un comentario**. El rechazo también la devuelve al bot.
4. El bot añade una versión y la reenvía. El ciclo **empieza otra vez en Domingo**: un rechazo del cliente no se salta su revisión. El historial (`audit`) no se borra: cada envío, aprobación y rechazo queda con quién, cuándo y el comentario.
5. En cada cambio se guarda un evento y, si hay webhook, sale un aviso de **una línea más el enlace** a la aprobación. No se manda el texto de la pieza, ni el comentario, ni el enlace de Drive.

### Datos y RGPD

La caja fuerte guarda el secreto cifrado (AES-256-GCM) con `CREDENTIALS_VAULT_KEY`. Las listas solo enseñan proveedor y etiqueta. El export RGPD tampoco incluye el secreto: lo borra junto con el resto de datos personales. De las facturas y los pagos se conservan los importes (contabilidad) y se quitan el email y el nombre del pagador. El documento de Google no se borra solo: hay que tirarlo en Drive.

Las variables nuevas están en `.env.example`. La API arranca sin ellas; la caja fuerte y el correo del código fallan de forma explícita hasta que estén puestas. No despliegues este cambio hasta que el portal pida el código de 6 dígitos.
