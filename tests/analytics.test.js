import { describe, it, expect } from 'vitest';
import { classify_source, classify_device, is_public_path, normalize_event_location } from '../src/services/analytics_service.js';
import { geo_from_proxy_headers, parse_path, parse_domain } from '../src/services/measurement_fields.js';
import { parse_anon_payload } from '../src/services/anon_analytics_service.js';
import { lead_schema } from '../src/schemas/lead_schema.js';
import { PRIVACY_VERSION } from '../src/config/services.js';

describe('analytics — clasificación de origen', () => {
  it('sin procedencia es tráfico directo (el caso del flyer)', () => {
    expect(classify_source(null)).toBe('directo');
    expect(classify_source('')).toBe('directo');
  });

  it('reconoce las redes que importan', () => {
    expect(classify_source('https://www.instagram.com/')).toBe('instagram');
    expect(classify_source('https://l.facebook.com/')).toBe('facebook');
    expect(classify_source('https://www.google.es/search?q=terapeutas')).toBe('google');
    expect(classify_source('https://wa.me/')).toBe('whatsapp');
  });

  it('navegar dentro del propio sitio no cuenta como origen externo', () => {
    expect(classify_source('https://midiginode.com/faq')).toBe('directo');
  });

  it('una procedencia ilegible no revienta, cae en otro', () => {
    expect(classify_source('no-es-una-url')).toBe('otro');
    expect(classify_source('https://algunblog.com/post')).toBe('otro');
  });
});

describe('analytics — clasificación de dispositivo', () => {
  it('distingue móvil, tablet y escritorio', () => {
    expect(classify_device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('movil');
    expect(classify_device('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('movil');
    expect(classify_device('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet');
    expect(classify_device('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('escritorio');
  });

  it('sin user-agent asume escritorio en vez de fallar', () => {
    expect(classify_device()).toBe('escritorio');
  });
});

describe('analytics — qué se mide y qué no', () => {
  it('mide las páginas públicas', () => {
    expect(is_public_path('/')).toBe(true);
    expect(is_public_path('/formacion/ia-para-terapeutas')).toBe(true);
    expect(is_public_path('/blog/algun-articulo')).toBe(true);
  });

  it('NUNCA mide las zonas privadas', () => {
    expect(is_public_path('/portal/dashboard')).toBe(false);
    expect(is_public_path('/admin/clients')).toBe(false);
    expect(is_public_path('/login')).toBe(false);
    expect(is_public_path('/cambiar-contrasena')).toBe(false);
  });

  it('rechaza rutas con formas raras', () => {
    expect(is_public_path('https://otrositio.com/')).toBe(false);
    expect(is_public_path('sin-barra')).toBe(false);
    expect(is_public_path(null)).toBe(false);
    expect(is_public_path('/' + 'a'.repeat(250))).toBe(false);
  });
});

const anon_base = {
  type: 'pageview',
  path: '/contacto',
  referrer_domain: 'instagram.com',
  utm_source: 'ig',
  utm_medium: 'social',
  utm_campaign: 'nov',
  device: 'mobile',
  lang: 'es-es',
};

describe('analytics — hitos de contacto', () => {
  it('acepta los tres eventos nuevos y una ubicación de la lista', () => {
    expect(normalize_event_location('contact_call_click', 'header')).toEqual({
      event: 'contact_call_click',
      location: 'header',
    });
    expect(normalize_event_location('contact_whatsapp_click', 'fab').location).toBe('fab');
    expect(normalize_event_location('contact_form_submit', undefined).location).toBeNull();
  });

  it('rechaza ubicaciones y eventos que no están en la lista', () => {
    expect(normalize_event_location('contact_call_click', 'popup')).toBeNull();
    expect(normalize_event_location('checkout_click', 'header')).toBeNull();
    expect(normalize_event_location('inventado', null)).toBeNull();
    expect(normalize_event_location('booking_click', '').event).toBe('booking_click');
  });
});

describe('analytics — medición anónima', () => {
  it('normaliza un pageview y recorta la campaña', () => {
    const parsed = parse_anon_payload({ ...anon_base, utm_campaign: 'a'.repeat(120), path: '/contacto?email=persona@example.test' });
    expect(parsed.ok).toBe(true);
    expect(parsed.value.path).toBe('/contacto');
    expect(parsed.value.utm_campaign).toHaveLength(80);
    expect(parsed.value.lang).toBe('es-ES');
    expect(parsed.value).not.toHaveProperty('email');
  });

  it('rechaza tipo, dispositivo, contacto y origen no permitidos', () => {
    expect(parse_anon_payload({ ...anon_base, type: 'compra' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, device: 'movil' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, type: 'contact_click' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, type: 'contact_click', contact_type: 'sms' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, contact_type: 'call' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, referrer_domain: 'https://instagram.com/alguien' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, referrer_domain: '203.0.113.10' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, path: '/admin/clientes' }).ok).toBe(false);
    expect(parse_anon_payload({ ...anon_base, utm_source: 'ig <script>' }).ok).toBe(false);
  });

  it('acepta el clic de contacto con ubicación', () => {
    const parsed = parse_anon_payload({
      ...anon_base,
      type: 'contact_click',
      contact_type: 'whatsapp',
      location: 'footer',
    });
    expect(parsed.value).toMatchObject({ type: 'contact_click', contact_type: 'whatsapp', location: 'footer' });
  });

  it('el país sale de las cabeceras del proxy y no de una IP', () => {
    expect(geo_from_proxy_headers({ 'cf-ipcountry': 'es', 'cf-ipcity': 'M%C3%A1laga' })).toEqual({
      country: 'ES',
      city: 'Málaga',
    });
    expect(geo_from_proxy_headers({ 'x-vercel-ip-country': 'FR', 'x-forwarded-for': '203.0.113.8' })).toEqual({
      country: 'FR',
      city: '',
    });
    expect(geo_from_proxy_headers({ 'cf-ipcountry': 'XX', 'cf-ipcity': '203.0.113.8' }).country).toBe('');
    expect(geo_from_proxy_headers({ 'cf-ipcity': '203.0.113.8' }).city).toBe('');
    expect(parse_domain('Instagram.com')).toBe('instagram.com');
    expect(parse_path('/portal/cuenta')).toBeNull();
  });
});

describe('analytics — recorrido del formulario', () => {
  const base = {
    request_id: '0b6d4b2e-3a1f-4d5e-8c7b-9a0f1e2d3c4b',
    name: 'Ana García',
    company: 'Clínica Norte',
    email: 'ana@example.test',
    service_interest: 'digital_clinic',
    goal: 'Quiero ordenar las citas y las consultas repetidas',
    privacy_version: PRIVACY_VERSION,
    privacy_acknowledged: true,
  };

  it('recorta el texto, la campaña y la ruta, y exige UUID v4', () => {
    const parsed = lead_schema.parse({
      ...base,
      visitor_id: '0B6D4B2E-3A1F-4D5E-8C7B-9A0F1E2D3C4B',
      journey_consent: {
        accepted: true,
        text_version: 'v'.repeat(50),
        text: 'Acepto el recorrido. ' + 'x'.repeat(600),
        at: new Date().toISOString(),
      },
      journey: {
        entry: { referrer_domain: 'Google.com', utm_source: 'g'.repeat(90), utm_medium: 'cpc', utm_campaign: 'nov' },
        events: [{ type: 'pageview', path: '/clinica-digital?email=persona@example.test', at: new Date().toISOString() }],
      },
    });
    expect(parsed.visitor_id).toBe('0b6d4b2e-3a1f-4d5e-8c7b-9a0f1e2d3c4b');
    expect(parsed.journey_consent.text_version).toHaveLength(40);
    expect(parsed.journey_consent.text.length).toBeLessThanOrEqual(500);
    expect(parsed.journey.entry.utm_source).toHaveLength(80);
    expect(parsed.journey.entry.referrer_domain).toBe('google.com');
    expect(parsed.journey.events[0].path).toBe('/clinica-digital');
    expect(JSON.stringify(parsed.journey)).not.toContain('persona@example.test');
  });

  it('rechaza consentimiento incompleto, uuid mal formado y más de 200 eventos', () => {
    expect(lead_schema.safeParse({ ...base, visitor_id: 'no-es-uuid' }).success).toBe(false);
    expect(
      lead_schema.safeParse({
        ...base,
        journey_consent: { accepted: true, text_version: 'v1' },
      }).success
    ).toBe(false);
    expect(
      lead_schema.safeParse({
        ...base,
        journey: {
          events: Array.from({ length: 201 }, () => ({
            type: 'pageview',
            path: '/',
            at: new Date().toISOString(),
          })),
        },
      }).success
    ).toBe(false);
    expect(
      lead_schema.safeParse({
        ...base,
        journey_consent: { accepted: false },
        journey: { events: [{ type: 'contact_click', path: '/admin', at: new Date().toISOString(), contact_type: 'call' }] },
      }).success
    ).toBe(false);
  });
});
