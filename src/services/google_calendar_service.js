import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Builds an authenticated OAuth2 client from stored tokens.
// Automatically refreshes the access token if expired.
const build_auth_client = (oauth_tokens) => {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials(oauth_tokens);
  return auth;
};

/**
 * Lists free time slots for a given date within working hours.
 * @param {object} oauth_tokens     - Stored OAuth2 tokens from ClientConfig
 * @param {string} calendar_id      - Google Calendar ID (usually 'primary')
 * @param {string} date             - 'YYYY-MM-DD'
 * @param {number} duration_min     - Slot duration in minutes
 * @param {string} work_start       - 'HH:MM' (e.g. '09:00')
 * @param {string} work_end         - 'HH:MM' (e.g. '19:00')
 * @returns {Array} Array of { start, end } ISO strings for free slots
 */
const list_free_slots = async (oauth_tokens, calendar_id, date, duration_min, work_start = '09:00', work_end = '19:00') => {
  const auth     = build_auth_client(oauth_tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const [sh, sm] = work_start.split(':').map(Number);
  const [eh, em] = work_end.split(':').map(Number);

  const day_start = new Date(`${date}T${work_start}:00`);
  const day_end   = new Date(`${date}T${work_end}:00`);

  // Get busy blocks
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin:  day_start.toISOString(),
      timeMax:  day_end.toISOString(),
      items:    [{ id: calendar_id }],
    },
  });

  const busy = (data.calendars?.[calendar_id]?.busy ?? [])
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start - b.start);

  // Walk working hours and collect free slots
  const slots   = [];
  let cursor    = new Date(day_start);
  const dur_ms  = duration_min * 60_000;

  for (const block of busy) {
    while (cursor.getTime() + dur_ms <= block.start.getTime()) {
      const slot_end = new Date(cursor.getTime() + dur_ms);
      slots.push({ start: cursor.toISOString(), end: slot_end.toISOString() });
      cursor = slot_end;
    }
    if (cursor < block.end) cursor = new Date(block.end);
  }

  // Remaining slots after last busy block
  while (cursor.getTime() + dur_ms <= day_end.getTime()) {
    const slot_end = new Date(cursor.getTime() + dur_ms);
    slots.push({ start: cursor.toISOString(), end: slot_end.toISOString() });
    cursor = slot_end;
  }

  return slots;
};

/**
 * Creates a calendar event for an appointment.
 * @returns {object} { event_id, html_link }
 */
const create_event = async (oauth_tokens, calendar_id, { summary, description, start_iso, end_iso, patient_phone }) => {
  const auth     = build_auth_client(oauth_tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const { data } = await calendar.events.insert({
    calendarId: calendar_id,
    requestBody: {
      summary,
      description: `${description ?? ''}\nPatient: ${patient_phone ?? ''}`.trim(),
      start: { dateTime: start_iso, timeZone: 'Europe/Madrid' },
      end:   { dateTime: end_iso,   timeZone: 'Europe/Madrid' },
      extendedProperties: {
        private: { patient_phone: patient_phone ?? '' },
      },
    },
  });

  return { event_id: data.id, html_link: data.htmlLink };
};

/**
 * Cancels (deletes) a calendar event.
 */
const cancel_event = async (oauth_tokens, calendar_id, event_id) => {
  const auth     = build_auth_client(oauth_tokens);
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId: calendar_id, eventId: event_id });
};

/**
 * Updates an existing event (reschedule).
 */
const reschedule_event = async (oauth_tokens, calendar_id, event_id, { start_iso, end_iso }) => {
  const auth     = build_auth_client(oauth_tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: existing } = await calendar.events.get({ calendarId: calendar_id, eventId: event_id });

  const { data } = await calendar.events.update({
    calendarId: calendar_id,
    eventId:    event_id,
    requestBody: {
      ...existing,
      start: { dateTime: start_iso, timeZone: 'Europe/Madrid' },
      end:   { dateTime: end_iso,   timeZone: 'Europe/Madrid' },
    },
  });

  return { event_id: data.id, html_link: data.htmlLink };
};

/**
 * Lists all events on a given date — used by the gap-fill algorithm.
 * @returns {Array} Raw Google Calendar event objects
 */
const list_events_on_date = async (oauth_tokens, calendar_id, date) => {
  const auth     = build_auth_client(oauth_tokens);
  const calendar = google.calendar({ version: 'v3', auth });

  const day_start = new Date(`${date}T00:00:00`);
  const day_end   = new Date(`${date}T23:59:59`);

  const { data } = await calendar.events.list({
    calendarId:   calendar_id,
    timeMin:      day_start.toISOString(),
    timeMax:      day_end.toISOString(),
    singleEvents: true,
    orderBy:      'startTime',
  });

  return data.items ?? [];
};

/**
 * Generates a Google OAuth2 authorization URL for client onboarding.
 */
const get_auth_url = (state) => {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, state, prompt: 'consent' });
};

/**
 * Exchanges an authorization code for tokens (called on OAuth callback).
 */
const exchange_code = async (code) => {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const { tokens } = await auth.getToken(code);
  return tokens;
};

export { list_free_slots, create_event, cancel_event, reschedule_event, list_events_on_date, get_auth_url, exchange_code };
