# Diginode Empleados AI — Implementation Phases

This document is the source of truth for any Claude session continuing work on this project.
Read it completely before making any changes.

---

## Project Overview

**diginode-api** is a multi-tenant SaaS backend (Node.js + Express + MongoDB Atlas) that sells
AI employees to freelancers and micro-businesses (initially health/wellness professionals).

**Business model:**
| Plan | Monthly | Setup | Included |
|------|---------|-------|----------|
| Empleado Individual | €180 | €200 | 1 employee of choice |
| Estudio | €300 | €350 | Recepcionista + 1 employee |
| Clínica | €500 | €550 | All 4 employees |

**4 AI employees:**
1. **Recepcionista** — patient-facing (WhatsApp/Instagram), books appointments via Google Calendar
2. **Asistente Ejecutivo** — professional-facing (Telegram), drafts emails, reads agenda, delegates
3. **Gestor de Relaciones** — patient follow-ups (outbound WhatsApp) + professional's "second brain"
4. **Content Manager** — content creation (HeyGen avatars, ElevenLabs voice, OpusClip)

**Key architecture decisions:**
- One backend, per-client data isolation via `client_id` in every record
- BYOK: clients own their WhatsApp/Google credentials; user owns Railway compute
- Each employee is a Node.js module with `build_system_prompt()`, `EMITS`, `LISTENS`, tools
- Client-scoped event bus (`src/core/event-bus.js`) — employees of different clients NEVER communicate
- Agentic loop in `anthropic_service.js` — MAX_ITERATIONS=10, prompt caching, tool use
- Recepcionista → `claude-haiku-4-5-20251001`; others → `claude-sonnet-4-6`

---

## Phase Status

### ✅ Phase 1 — Foundation (COMPLETE)

**What was built:**

| File | Description |
|------|-------------|
| `src/models/client_model.js` | Added AI plans, `active_employees`, `onboarding_status` |
| `src/models/patient_model.js` | NEW — patient record with per-channel conversation history |
| `src/models/client_config_model.js` | NEW — per-client credentials + employee personality config |
| `src/services/stripe_service.js` | Added `create_ai_plan_checkout_session`, `handle_ai_plan_checkout` |
| `src/employees/index.js` | NEW — employee registry |
| `src/employees/recepcionista/index.js` | Skeleton with `build_system_prompt` |
| `src/employees/asistente/index.js` | Skeleton |
| `src/employees/gestor-relaciones/index.js` | Skeleton |
| `src/employees/content-manager/index.js` | Skeleton |
| `src/core/event-bus.js` | NEW — client-scoped EventEmitter per client_id |
| `src/routes/empleados_routes.js` | NEW — `GET /api/empleados/plans`, `POST /api/empleados/checkout` |
| `src/controllers/portal_controller.js` | Added `get_portal_plan()` |
| `src/routes/portal_routes.js` | Added `GET /portal/plan` |
| `src/app.js` | Registered `/api/empleados` |

**Frontend (diginode-client):**
- `src/views/home/PlanesView.vue` — pricing page with Stripe checkout
- `src/views/portal/PlanView.vue` — client portal plan & onboarding progress
- `src/router/index.js` — added `/planes` and `/portal/plan`
- `src/components/layout/AppSidebar.vue` — added "Mi Plan" nav item

---

### ✅ Phase 2 — Recepcionista Full Implementation (COMPLETE)

**What was built:**

| File | Description |
|------|-------------|
| `src/services/anthropic_service.js` | NEW — agentic loop with tool use + prompt caching |
| `src/services/whatsapp_service.js` | NEW — Meta WhatsApp Cloud API direct (no Twilio) |
| `src/services/telegram_service.js` | NEW — Telegram Bot API via fetch |
| `src/services/google_calendar_service.js` | NEW — OAuth2, freebusy, create/cancel/reschedule events |
| `src/employees/recepcionista/tools/calendar_tools.js` | NEW — 4 calendar tools for Claude |
| `src/employees/recepcionista/tools/patient_tools.js` | NEW — get_patient_info, set_flexible, escalate |
| `src/employees/recepcionista/tools/gap_fill_tools.js` | NEW — gap-fill algorithm on cancellations |
| `src/employees/recepcionista/conversation.js` | NEW — patient + professional conversation loops |
| `src/employees/recepcionista/channels/whatsapp_handler.js` | NEW — 10s buffer, routes by phone_number_id |
| `src/employees/recepcionista/channels/telegram_handler.js` | NEW — professional Telegram bot |
| `src/controllers/webhook_controller.js` | Updated `handle_whatsapp` to call new handler |
| `src/routes/webhook_routes.js` | Added `POST /telegram/:client_id` |

**How WhatsApp routing works:**
- Meta sends all messages to `POST /api/webhooks/meta/whatsapp`
- `handle_whatsapp_inbound(body)` buffers messages 10s (debounce rapid messages)
- On flush: looks up `ClientConfig` by `whatsapp_phone_number_id`
- If found → Recepcionista processes it (Claude API)
- If not found → returns early; legacy `add_to_buffer` handles it via Make.com

**How Telegram routing works:**
- Each client has their own Telegram bot with a unique webhook URL: `POST /api/webhooks/telegram/:client_id`
- The `x-telegram-bot-api-secret-token` header is validated against `ClientConfig.telegram_secret`
- All Telegram messages go to `process_professional_command()` (professional-mode system prompt)

**Gap-fill algorithm:**
Triggered when a patient cancels → `run_gap_fill({ client_id, cancelled_slot_iso, freed_duration_min })`
1. Find same-day patients who could advance their appointment
2. Find patients with `flexible_schedule = true` within 7 days
3. Send WhatsApp offer: "Se ha liberado un hueco el [slot]. ¿Te gustaría adelantar?"
4. Publish `GAP_FILL_INITIATED` or `GAP_UNFILLED` on the event bus

---

### ✅ Phase 3 — Asistente Ejecutivo + Onboarding (COMPLETE)

**What was built:**

| File | Description |
|------|-------------|
| `src/employees/asistente/tools/task_tools.js` | NEW — 5 tools: draft_email, get_agenda_summary, create_reminder, search_knowledge_base, delegate_to_content_manager |
| `src/employees/asistente/conversation.js` | NEW — professional-only loop, persists history to ClientConfig |
| `src/employees/asistente/channels/telegram_handler.js` | NEW — separate Telegram bot for Asistente |
| `src/controllers/onboarding_controller.js` | NEW — Google OAuth callback, Telegram bot setup, config CRUD |
| `src/routes/onboarding_routes.js` | NEW — `/api/onboarding/*` client-authenticated routes |
| `src/models/client_config_model.js` | Added `asistente_telegram_*` fields + `asistente.telegram_history` |
| `src/routes/webhook_routes.js` | Added `POST /asistente/telegram/:client_id` |
| `src/routes/admin_routes.js` | Added config management routes |
| `src/controllers/admin_controller.js` | Added `get_client_config`, `update_client_config`, `setup_client_telegram_webhook` |
| `src/app.js` | Registered `/api/onboarding` |

**Onboarding API endpoints:**
```
GET  /api/onboarding/google/auth-url       → returns Google OAuth URL (client auth required)
GET  /api/onboarding/google/callback       → PUBLIC, receives code from Google, saves tokens
POST /api/onboarding/telegram/setup        → registers Telegram webhook for recepcionista or asistente
GET  /api/onboarding/config                → get non-sensitive config for logged-in client
PATCH /api/onboarding/config               → update personality/schedule config (no credentials)
GET  /api/onboarding/status                → checklist: what's connected, what's pending
```

**Admin API additions:**
```
GET   /api/admin/clients/:id/config                    → view ClientConfig (masked credentials)
PATCH /api/admin/clients/:id/config                    → update any field (admin can set credentials)
POST  /api/admin/clients/:id/config/telegram-webhook   → register Telegram webhook for a client
```

**Required env vars (add to Railway):**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-api-domain.com/api/onboarding/google/callback
API_BASE_URL=https://your-api-domain.com
```

---

## 🚧 Phase 4 — Gestor de Relaciones + Segundo Cerebro (PENDING)

**Goal:** Build the `gestor-relaciones` employee with two distinct modes.

**Mode 1 — Outbound follow-ups:**
- Listens to event bus: `APPOINTMENT_BOOKED`, `APPOINTMENT_CANCELLED`
- Sends proactive WhatsApp messages to patients after sessions
- Detects disengagement (3+ cancellations, no booking in X days)
- Sends re-engagement message via WhatsApp, publishes `PATIENT_AT_RISK_ALERT`

**Mode 2 — Segundo Cerebro (professional-facing):**
- Professional sends patient case notes via Telegram
- Claude analyzes patterns, offers alternative perspectives, generates session briefs
- Stores case analysis in a new `CaseNote` model (or in patient notes)

**Files to create:**
```
src/employees/gestor-relaciones/tools/followup_tools.js
  - send_followup_message(patient_id, message_type)
  - detect_inactive_patients(days_since_last_booking)
  - get_patient_engagement_stats(patient_id)
  - send_reengagement_message(patient_id, approach)
  - flag_patient_alert(patient_id, reason)

src/employees/gestor-relaciones/tools/segundo_cerebro_tools.js
  - analyze_case(patient_id, session_notes)
  - get_patient_history(patient_id)
  - generate_session_brief(patient_id, objectives)
  - detect_patterns(patient_ids_or_query)
  - save_case_note(patient_id, note)

src/employees/gestor-relaciones/conversation.js
  - process_segundo_cerebro_command({ client_id, text }) — professional mode
  - process_patient_followup({ client_id, patient_id, trigger }) — outbound auto-mode

src/employees/gestor-relaciones/channels/telegram_handler.js
  - handle_gestor_telegram(req, res) — professional uses Telegram for Segundo Cerebro

src/employees/gestor-relaciones/event_listeners.js
  - Sets up event bus subscriptions: APPOINTMENT_CANCELLED, APPOINTMENT_BOOKED
  - Runs follow-up timers (use node-cron or setTimeout chains)
```

**Models to create/update:**
```
src/models/case_note_model.js
  - client_id, patient_id, session_date, notes, analysis, patterns, session_brief
  - Keep separate from patient_model for cleaner concerns

OR add to patient_model:
  - case_notes: [{ date, raw_notes, ai_analysis, timestamp }]
```

**Routes to add:**
```
webhook_routes.js:
  POST /gestor/telegram/:client_id → handle_gestor_telegram

admin_routes.js:
  Already covered by generic /clients/:id/config
```

**Event bus integration:**
The Gestor subscribes to events fired by Recepcionista. This subscription needs to be
initialized on server startup. Add to `src/server.js` or a new `src/core/subscriptions.js`:
```javascript
import { subscribe } from './core/event-bus.js';
// For each active client, subscribe the Gestor to APPOINTMENT_CANCELLED events
// (load active clients from DB on startup)
```

**Important:** The Gestor uses WhatsApp for outbound messages to patients.
Use the same `send_text` from `whatsapp_service.js`.

---

## 🚧 Phase 5 — Content Manager (PENDING)

**Goal:** Build the `content-manager` employee with AI-powered content creation.

**External APIs to integrate:**
- **HeyGen** — AI avatar video generation (professional uploads their face video once)
- **ElevenLabs** — voice cloning from sample audio
- **OpusClip** — automatic clip extraction from long-form video

**Files to create:**
```
src/services/heygen_service.js
  - create_avatar_video(avatar_id, script, voice_id)
  - get_video_status(video_id)
  - list_avatars(api_key)

src/services/elevenlabs_service.js
  - generate_narration(voice_id, text)
  - list_voices(api_key)

src/services/opusclip_service.js
  - extract_clips(video_url, duration_target)
  - get_clip_status(job_id)

src/employees/content-manager/tools/content_tools.js
  - generate_script(topic, format, duration_sec)
  - create_avatar_video(script_id, avatar_id)
  - clone_voice_narration(text, voice_id)
  - extract_clips(video_url, target_duration)
  - suggest_content_calendar(pillars, frequency)
  - repurpose_content(original_content, target_format)

src/employees/content-manager/conversation.js
  - process_content_request({ client_id, text, source })
  - source can be 'telegram_direct' or 'event_bus' (delegated by Asistente)

src/employees/content-manager/channels/telegram_handler.js
  - handle_content_manager_telegram(req, res)

src/employees/content-manager/event_listeners.js
  - Listens to CONTENT_REQUEST from event bus (delegated by Asistente)
```

**ClientConfig additions:**
```
content_manager_telegram_bot_token, content_manager_telegram_secret
content_manager:
  heygen_api_key, heygen_avatar_id
  elevenlabs_api_key, elevenlabs_voice_id
  opusclip_api_key
```

**Webhook route to add:**
```
POST /content-manager/telegram/:client_id → handle_content_manager_telegram
```

---

## 🚧 Phase 6 — Full Inter-Employee Event Bus (PENDING)

**Goal:** All 4 employees are live and communicating via the event bus.

**Event flow map:**
```
Recepcionista
  → APPOINTMENT_BOOKED      → Gestor (start follow-up timer)
  → APPOINTMENT_CANCELLED   → Gestor (gap-fill + re-engagement tracking)
  → PATIENT_ESCALATED       → notify professional via Telegram

Asistente
  → CONTENT_REQUEST         → Content Manager (delegated content tasks)
  → TASK_COMPLETED          → dashboard event log

Gestor
  → PATIENT_AT_RISK_ALERT   → notify professional via Telegram
  → FOLLOWUP_SENT           → dashboard event log
  → REENGAGEMENT_SENT       → dashboard event log

Content Manager
  → CONTENT_READY           → Asistente (notify professional)
  → CLIPS_READY             → dashboard event log
```

**Files to create:**
```
src/core/subscriptions.js
  - init_subscriptions(active_client_ids)
  - Called on server startup: for each active AI client, subscribes all their
    active employees to the events they LISTEN to

src/server.js
  - On startup, load all clients with AI plans and call init_subscriptions()
```

**What init_subscriptions does:**
```javascript
// For each client_id:
subscribe(client_id, {
  types: ['APPOINTMENT_CANCELLED', 'APPOINTMENT_BOOKED'],
  employee: 'gestor-relaciones',
  handler: (event) => handle_gestor_event(client_id, event),
});

subscribe(client_id, {
  types: ['CONTENT_REQUEST'],
  employee: 'content-manager',
  handler: (event) => handle_content_event(client_id, event),
});
```

---

## 🚧 Phase 7 — Frontend Onboarding Wizard (PENDING)

**Goal:** Build the client-side onboarding flow in `diginode-client`.

The diginode-client frontend lives at a different path. This phase builds
the onboarding wizard that guides the client through:
1. Connect Google Calendar (OAuth button → redirect)
2. Set up Recepcionista Telegram bot (paste token + test)
3. Set up Asistente Ejecutivo Telegram bot
4. Configure personality (employee names, tone, services list, FAQs)
5. Set working hours + appointment duration
6. Test mode (send a test WhatsApp message)

**Views to create in diginode-client:**
```
src/views/portal/OnboardingView.vue
  - Step-by-step wizard with progress indicator
  - Step 1: Google Calendar connect
  - Step 2: WhatsApp (display WABA docs, collect phone_number_id)
  - Step 3: Telegram bots (Recepcionista + Asistente)
  - Step 4: Employee personality config
  - Step 5: Schedule & appointment defaults
  - Step 6: Review + go live
```

**API calls used:**
- `GET /api/onboarding/status` — determine which steps are done
- `GET /api/onboarding/google/auth-url` → redirect user to Google
- `POST /api/onboarding/telegram/setup` — register bot
- `PATCH /api/onboarding/config` — save personality + schedule config

---

## Environment Variables (complete list)

```env
# Core
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
FRONTEND_URL=https://...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Meta WhatsApp (legacy / admin account)
META_VERIFY_TOKEN=...
META_PHONE_NUMBER_ID=...        # legacy number only
META_ACCESS_TOKEN=...           # legacy token only

# Google OAuth (shared OAuth app — all clients use same credentials)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.domain.com/api/onboarding/google/callback

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Infrastructure
API_BASE_URL=https://api.domain.com   # used to build Telegram webhook URLs
```

---

## Data Model Quick Reference

### ClientConfig (src/models/client_config_model.js)
Key fields:
- `client_id` — ref to Client (unique)
- `whatsapp_phone_number_id` — used to route incoming Meta webhooks to this client
- `whatsapp_access_token` — long-lived Meta system user token
- `telegram_bot_token` / `telegram_secret` — Recepcionista's bot
- `asistente_telegram_bot_token` / `asistente_telegram_secret` — Asistente's bot
- `google_oauth.refresh_token` — persisted OAuth token for Google Calendar
- `appointment_duration_min`, `working_hours_start`, `working_hours_end`, `days_off`
- `recepcionista.*` — employee name, tone, services, FAQs, schedule text
- `asistente.*` — employee name, writing style, methodology, telegram_history

### Patient (src/models/patient_model.js)
Key fields:
- `client_id`, `phone`, `instagram_id` — multi-channel identifier
- `flexible_schedule` — eligible for gap-fill algorithm
- `next_appointment`, `upcoming_event_ids` — Google Calendar event tracking
- `whatsapp_history`, `instagram_history`, `telegram_history` — per-channel conversations (trimmed to 40 turns)

### Event Bus (src/core/event-bus.js)
```javascript
publish(client_id, { type, from, payload })
subscribe(client_id, { types, employee, handler }) → unsubscribeFn
destroy(client_id)
```
Events are STRICTLY scoped. An employee of client A cannot receive events from client B.

---

## Key File Map (Phase 2 + 3 complete)

```
src/
├── app.js                          ← route registration
├── server.js                       ← DB connect + server start
├── core/
│   └── event-bus.js                ← client-scoped EventEmitter
├── employees/
│   ├── index.js                    ← registry
│   ├── recepcionista/
│   │   ├── index.js                ← system prompt builder
│   │   ├── conversation.js         ← process_patient_message + process_professional_command
│   │   ├── channels/
│   │   │   ├── whatsapp_handler.js ← 10s buffer → flush → Claude
│   │   │   └── telegram_handler.js ← professional ↔ Recepcionista
│   │   └── tools/
│   │       ├── calendar_tools.js   ← check_availability, book, cancel, reschedule
│   │       ├── patient_tools.js    ← get_info, set_flexible, escalate
│   │       └── gap_fill_tools.js   ← run_gap_fill()
│   ├── asistente/
│   │   ├── index.js                ← system prompt builder
│   │   ├── conversation.js         ← process_asistente_command (persists to ClientConfig)
│   │   ├── channels/
│   │   │   └── telegram_handler.js ← professional ↔ Asistente
│   │   └── tools/
│   │       └── task_tools.js       ← draft_email, get_agenda, create_reminder, kb_search, delegate
│   ├── gestor-relaciones/
│   │   └── index.js                ← skeleton (Phase 4)
│   └── content-manager/
│       └── index.js                ← skeleton (Phase 5)
├── services/
│   ├── anthropic_service.js        ← agentic loop, prompt caching
│   ├── whatsapp_service.js         ← Meta Cloud API direct
│   ├── telegram_service.js         ← Telegram Bot API
│   └── google_calendar_service.js  ← OAuth2 + Calendar v3
├── models/
│   ├── patient_model.js
│   └── client_config_model.js
├── controllers/
│   ├── onboarding_controller.js    ← Google OAuth + Telegram setup + config CRUD
│   └── admin_controller.js         ← includes get/update_client_config
└── routes/
    ├── webhook_routes.js           ← /telegram/:id, /asistente/telegram/:id, /meta/whatsapp
    ├── onboarding_routes.js        ← /google/auth-url, /google/callback, /telegram/setup, /config
    └── admin_routes.js             ← /clients/:id/config + /telegram-webhook
```
