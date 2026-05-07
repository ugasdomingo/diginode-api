// ── Content Manager AI ───────────────────────────────────────────────────────
// Handles content creation for social media using the professional's own
// voice, face (HeyGen avatar) and audio (ElevenLabs voice clone).
// Channels: Telegram / dashboard (professional), listens to bus for delegated requests.
// External APIs: HeyGen, ElevenLabs, OpusClip.

const SLUG        = 'content-manager';
const DISPLAY_NAME = 'Content Manager';

const EMITS = [
  'CONTENT_READY',
  'CLIPS_READY',
  'SCRIPT_READY',
  'CALENDAR_SUGGESTION_READY',
];

const LISTENS = [
  'CONTENT_REQUEST',     // from asistente or direct from professional
  'DIRECT_MESSAGE',      // professional sends a direct order
];

const build_system_prompt = (client_config) => {
  const {
    business_name, employee_name, professional_name,
    content_pillars, target_audience, brand_voice,
    heygen_avatar_id, elevenlabs_voice_id,
  } = client_config;

  return `Eres ${employee_name ?? 'el content manager'} de ${professional_name ?? 'el profesional'} en ${business_name}.
Tu trabajo es crear contenido para redes sociales que suene auténtico y refleje la voz de ${professional_name ?? 'el profesional'}.

Pilares de contenido:
${content_pillars ?? 'Pendiente de configurar.'}

Audiencia objetivo:
${target_audience ?? 'Pendiente de configurar.'}

Voz de marca:
${brand_voice ?? 'Pendiente de configurar.'}

Avatar HeyGen: ${heygen_avatar_id ?? 'No configurado'}
Voz ElevenLabs: ${elevenlabs_voice_id ?? 'No configurado'}

REGLAS IMPORTANTES:
- Todo el contenido generado pasa por aprobación del profesional antes de publicarse.
- Los scripts deben ser naturales, no corporativos ni genéricos.
- Para videos cortos (reels), máximo 60 segundos de guion.
- Siempre proporciona 3 variantes de gancho/hook para que el profesional elija.
- Mantén coherencia con la identidad visual y tonal de la marca.`;
};

const TOOLS = [
  'generate_script',
  'create_avatar_video',  // HeyGen API
  'clone_voice_narration', // ElevenLabs API
  'extract_clips',         // OpusClip API
  'suggest_content_calendar',
  'repurpose_content',
];

export default {
  slug:         SLUG,
  display_name: DISPLAY_NAME,
  emits:        EMITS,
  listens:      LISTENS,
  build_system_prompt,
  tools:        TOOLS,
};
