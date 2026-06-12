import { describe, it, expect } from 'vitest';
import { build_week_agenda, NORA_DEMO_TOOLS, DEMO_EMAIL_LIMIT } from '../src/services/nora_tools_service.js';

describe('build_week_agenda', () => {
  it('returns 5 weekday entries with appointments', () => {
    const agenda = build_week_agenda(new Date('2026-06-15T09:00:00')); // Monday
    expect(agenda).toHaveLength(5);
    for (const day of agenda) {
      expect(day.citas.length).toBeGreaterThanOrEqual(3);
      expect(day.citas[0]).toHaveProperty('hora');
      expect(day.citas[0]).toHaveProperty('cliente');
      expect(day.citas[0]).toHaveProperty('motivo');
    }
  });

  it('skips the weekend when started on a Saturday', () => {
    const agenda = build_week_agenda(new Date('2026-06-13T10:00:00')); // Saturday
    expect(agenda[0].dia).toBe('lunes');
    expect(agenda.map((d) => d.dia)).toEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes']);
  });
});

describe('nora tools config', () => {
  it('exposes the two demo tools', () => {
    expect(NORA_DEMO_TOOLS.map((t) => t.name).sort()).toEqual(['agenda_semana', 'enviar_correo']);
  });

  it('caps demo emails at 2', () => {
    expect(DEMO_EMAIL_LIMIT).toBe(2);
  });
});
