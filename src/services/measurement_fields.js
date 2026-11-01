// Campos compartidos por la medición anónima, las visitas con cookie y el
// recorrido que el formulario puede adjuntar. Aquí solo se valida y se recorta:
// no se toca la base de datos ni se lee ninguna IP.

const PRIVATE_PREFIXES = ['/portal', '/admin', '/login', '/cambiar-contrasena'];

const PATH_MAX = 200;
const UTM_MAX = 80;
const DOMAIN_MAX = 253;
const TEXT_VERSION_MAX = 40;
const CONSENT_TEXT_MAX = 500;
const CITY_MAX = 60;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTM_CHARS = /^[A-Za-z0-9._~+-]+$/;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TEXT_VERSION_CHARS = /^[A-Za-z0-9._-]+$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const CITY_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,59}$/u;

const strip_controls = (value) => {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 31 && code !== 127) out += char;
  }
  return out;
};

const has_control = (value) => strip_controls(value) !== value;

const CONTACT_LOCATIONS = Object.freeze(['header', 'fab', 'contact_section', 'footer', 'nora']);
const CONTACT_TYPES = Object.freeze(['call', 'whatsapp', 'form']);
const ANON_EVENT_TYPES = Object.freeze(['pageview', 'contact_click']);
const DEVICES = Object.freeze(['mobile', 'tablet', 'desktop']);
const ALLOWED_EVENTS = Object.freeze([
  'checkout_click',
  'purchase',
  'lead_cta_click',
  'lead_submit_success',
  'demo_start',
  'booking_click',
  'web_project_click',
  'digital_clinic_click',
  'contact_call_click',
  'contact_whatsapp_click',
  'contact_form_submit',
]);
const CONTACT_EVENTS = Object.freeze([
  'contact_call_click',
  'contact_whatsapp_click',
  'contact_form_submit',
]);
const CONTACT_TYPE_BY_EVENT = Object.freeze({
  contact_call_click: 'call',
  contact_whatsapp_click: 'whatsapp',
  contact_form_submit: 'form',
});

const JOURNEY_EVENT_LIMIT = 200;
const RETENTION_MONTHS = 13;

// Misma regla que la medición con sal diaria: el panel y el acceso no se miden.
const is_public_path = (path) =>
  typeof path === 'string' &&
  path.startsWith('/') &&
  path.length <= PATH_MAX &&
  !PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix));

const is_uuid_v4 = (value) => typeof value === 'string' && UUID_V4.test(value);

const parse_utm = (value) => {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 500 || !UTM_CHARS.test(trimmed)) return null;
  return trimmed.slice(0, UTM_MAX);
};

// Sólo un nombre de host. Una URL, un correo o una IP no son un dominio de origen.
const parse_domain = (value) => {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (!host) return '';
  if (host.length > DOMAIN_MAX || /[/:@?#\s]/.test(host) || host.includes('..')) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  if (!host.split('.').every((label) => HOST_LABEL.test(label))) return null;
  return host;
};

// Quita la query y el ancla (ahí viajan correos y session_id) y recorta a 200.
const parse_path = (value) => {
  if (typeof value !== 'string') return null;
  const stripped = value.trim().split('?')[0].split('#')[0];
  if (!stripped.startsWith('/')) return null;
  if (stripped.includes('\\') || stripped.includes('//') || stripped.includes('..')) return null;
  if (has_control(stripped) || stripped.includes('@')) return null;
  const truncated = stripped.slice(0, PATH_MAX);
  if (!is_public_path(truncated)) return null;
  return truncated;
};

const parse_lang = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return null;
  const match = trimmed.match(/^([a-zA-Z]{2})(?:-([a-zA-Z]{2}))?$/);
  if (!match) return null;
  return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
};

const parse_visitor_id = (value) => (is_uuid_v4(value) ? value.toLowerCase() : null);

// La fecha del navegador se acepta dentro de la retención. Un reloj adelantado
// unos minutos se recorta a «ahora»; más de un día, o más de 13 meses, se rechaza.
const parse_event_time = (value, now = new Date()) => {
  if (typeof value !== 'string' || value.trim().length > 40) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const current = now.getTime();
  if (date.getTime() > current + 24 * 60 * 60 * 1000) return null;
  const oldest = new Date(current);
  oldest.setUTCMonth(oldest.getUTCMonth() - RETENTION_MONTHS);
  if (date.getTime() < oldest.getTime()) return null;
  return new Date(Math.min(date.getTime(), current));
};

const parse_text_version = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || !TEXT_VERSION_CHARS.test(trimmed)) return null;
  return trimmed.slice(0, TEXT_VERSION_MAX);
};

const parse_consent_text = (value) => {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return null;
  const cleaned = strip_controls(value).trim();
  if (!cleaned) return '';
  return cleaned.slice(0, CONSENT_TEXT_MAX);
};

const header_value = (headers, name) => {
  if (!headers) return '';
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : '';
  return typeof raw === 'string' ? raw : '';
};

const parse_country_code = (raw) => {
  if (typeof raw !== 'string') return '';
  const code = raw.trim().toUpperCase();
  if (!COUNTRY_CODE.test(code) || code === 'XX') return '';
  return code;
};

const parse_city_name = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let city = raw.trim();
  try {
    city = decodeURIComponent(city);
  } catch {
    return '';
  }
  city = strip_controls(city).trim();
  if (city.length > CITY_MAX) city = city.slice(0, CITY_MAX).trim();
  if (!city || city.includes('@') || city.includes('/') || city.includes('\\')) return '';
  if (/\d{1,3}(?:\.\d{1,3}){3}/.test(city)) return '';
  if (!CITY_CHARS.test(city)) return '';
  return city;
};

// País y, como mucho, ciudad aproximada. Sólo cabeceras de proxy (Cloudflare o
// Vercel). No se consulta la IP: si esas cabeceras no vienen, el país queda vacío.
const geo_from_proxy_headers = (headers) => {
  const country =
    [header_value(headers, 'cf-ipcountry'), header_value(headers, 'x-vercel-ip-country')]
      .map(parse_country_code)
      .find(Boolean) ?? '';
  const city =
    [header_value(headers, 'cf-ipcity'), header_value(headers, 'x-vercel-ip-city')]
      .map(parse_city_name)
      .find(Boolean) ?? '';
  return { country, city };
};

const add_months = (date, months) => {
  const copy = new Date(date.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
};

const day_in_madrid = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

const shift_madrid_day = (iso_day, delta) => {
  const [year, month, day] = iso_day.split('-').map(Number);
  return day_in_madrid(new Date(Date.UTC(year, month - 1, day + delta, 12, 0, 0)));
};

export {
  ALLOWED_EVENTS,
  ANON_EVENT_TYPES,
  CITY_MAX,
  CONSENT_TEXT_MAX,
  CONTACT_EVENTS,
  CONTACT_LOCATIONS,
  CONTACT_TYPE_BY_EVENT,
  CONTACT_TYPES,
  DEVICES,
  DOMAIN_MAX,
  JOURNEY_EVENT_LIMIT,
  PATH_MAX,
  RETENTION_MONTHS,
  TEXT_VERSION_MAX,
  UTM_MAX,
  add_months,
  day_in_madrid,
  geo_from_proxy_headers,
  is_public_path,
  is_uuid_v4,
  parse_city_name,
  parse_consent_text,
  parse_country_code,
  parse_domain,
  parse_event_time,
  parse_lang,
  parse_path,
  parse_text_version,
  parse_utm,
  parse_visitor_id,
  shift_madrid_day,
};
