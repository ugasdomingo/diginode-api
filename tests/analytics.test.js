import { describe, it, expect } from 'vitest';
import { classify_source, classify_device, is_public_path } from '../src/services/analytics_service.js';

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
