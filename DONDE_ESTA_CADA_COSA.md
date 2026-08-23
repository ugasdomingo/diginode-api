# Dónde se guarda cada cosa

Mapa de todos los datos de DigiNode: qué se guarda, dónde vive y quién lo escribe.
Última revisión: 23 de agosto de 2026.

---

## Resumen en una línea

Casi todo vive en **MongoDB**. Las excepciones son: las **conversaciones de Instagram y las FAQs** (Airtable), los **cobros y recibos** (Stripe) y los **correos enviados** (Resend).

---

## 1. MongoDB — la base de datos principal

Alojada en MongoDB Atlas, conectada con `MONGO_URI`. Una colección por modelo.

| Qué | Colección | Quién lo escribe | Se ve en |
|---|---|---|---|
| **Visitas a la web** | `pageviews` | El navegador de cada visitante | Panel → Visitas |
| **Leads / prospectos** | `leads` | Nora (demo web), webhooks de Instagram, Cal.com | Panel → Leads, Funnel |
| **Inscripciones a talleres** | `trainingenrollments` | Webhook de Stripe al confirmarse el pago | Panel → Formaciones |
| **Clientes** | `clients` | Webhook de Stripe al contratar | Panel → Clientes |
| **Usuarios y contraseñas** | `users` | Se crea junto al cliente. Contraseñas cifradas (bcrypt) | — |
| **Pagos registrados** | `payments` | Webhook de Stripe | Panel → Clientes · Portal → Compras |
| **Suscripciones** | `packagesubscriptions` | Webhook de Stripe | Portal → Compras |
| **Tickets de soporte** | `supporttickets` | El cliente desde su portal | Panel → (pendiente) |
| **Base de conocimiento de Nora** | `knowledge` | Panel → Conocimiento, o `scripts/update_nora_kb.js` | Panel → Conocimiento |
| **Artículos del blog** | `blogposts` | Panel → Blog | Panel → Blog y web pública |
| **Campañas de contenido** | `campaigns` | Panel → Contenido (dispara Make.com) | Panel → Contenido |
| **Parrillas de contenido** | `contentgrids` | Agentes de contenido | *(sin pantalla)* |
| **Consumo de IA por cliente** | `usages` | Los agentes al responder | *(sin pantalla)* |
| **Webhooks fallidos** | `failedwebhooks` | Reintentos agotados hacia Make/Cal | *(sin pantalla)* |

### Detalle de lo que más te interesa

**`pageviews`** — una fila por página vista. Guarda: ruta, canal de origen (directo/instagram/google…), tipo de dispositivo, segundos de permanencia y si hubo clic en comprar o compra. **No guarda direcciones IP.** Se borra sola a los 90 días.

**`leads`** — incluye la **conversación completa** con Nora en `chat_history`. Ahí está, textualmente, lo que cada visitante le preguntó y objetó.

**`trainingenrollments`** — una fila por plaza vendida. Es lo que define el aforo y lo que hace que no se cobre dos veces por el mismo pago.

---

## 2. Airtable — conversaciones de Instagram y FAQs

Base `appg3sqgom3NIQuYy`, con el token `AIRTABLE_PAT`.

| Qué | Tabla | Se ve en |
|---|---|---|
| Conversaciones de Instagram (DMs y comentarios) | `tbl03ciTr2AIYO1KK` | Panel → Conversaciones |
| FAQs del agente de Instagram | `tblmmLyELanbMryr0` | — |

**Esto es lo que no recordabas.** Las conversaciones del panel no están en tu base de datos: viven en Airtable, en un sistema aparte del resto. Cada fila guarda el contacto, la plataforma, el estado, si la ha tomado un humano y el historial de mensajes en un campo de texto.

> Si `AIRTABLE_PAT` caduca o se borra, la sección Conversaciones deja de funcionar aunque el resto del panel siga bien.

---

## 3. Stripe — el dinero

Stripe es la fuente de verdad de todo lo económico: cobros, suscripciones, tarjetas y **recibos**. Tu base de datos solo guarda una copia de cada pago (importe, concepto, fecha y el enlace al recibo alojado en Stripe).

Los datos de tarjeta **nunca pasan por tu servidor ni se guardan en ningún sitio tuyo**: el pago ocurre entero dentro de Stripe.

---

## 4. Resend — los correos

Envía los correos (bienvenida, credenciales, seguimiento). El histórico de lo enviado queda en el panel de Resend, no en tu base de datos.

---

## 5. En el navegador del visitante

| Qué | Dónde | Cuándo |
|---|---|---|
| Identificador de conversación con Nora | `localStorage` (`dn_demo_contact`) | Solo si escribe a Nora |
| Sesión iniciada (token) | `localStorage` (`dn_token`) | Solo si inicia sesión |
| Identificador de la medición de visitas | En memoria | Muere al cerrar la pestaña |

**No hay cookies.** Está explicado en `/legal/cookies`.

---

## 6. Servicios de IA

Ningún dato se queda ahí, pero por ellos pasan las conversaciones:

- **Anthropic (Claude)** — Nora, en la demo y en los canales comerciales.
- **OpenAI** — el agente que responde DMs y comentarios de Instagram.
- **Google Gemini** — análisis de reuniones de venta y generación de contenido.

---

## Si algo deja de funcionar, mira aquí

| Síntoma | Causa probable |
|---|---|
| Conversaciones vacío o con error | `AIRTABLE_PAT` caducado |
| Nora no responde | `ANTHROPIC_API_KEY` |
| Instagram no responde | `INSTAGRAM_ACCESS_TOKEN` caducado (Meta los rota) |
| Contenido se queda en «pendiente» | `MAKE_CONTENT_WEBHOOK_URL` o el escenario de Make caído |
| Análisis de reuniones falla | `GEMINI_API_KEY` |
| Nadie recibe correos | `RESEND_API_KEY` o `RESEND_FROM_EMAIL` |
| Las visitas no suben | `ANALYTICS_SALT` no impide medir, pero revisa que la API responda |

Todas las variables están documentadas en `.env.example`.
