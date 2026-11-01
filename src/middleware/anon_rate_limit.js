// Tope global de la medición anónima. Guarda sólo marcas de tiempo numéricas,
// nunca direcciones IP ni identificadores. La ventana se vacía sola.

const hits = [];

const anon_rate_config = () => {
  const max_raw = Number(process.env.ANALYTICS_ANON_RATE_MAX ?? 2000);
  const window_raw = Number(process.env.ANALYTICS_ANON_RATE_WINDOW_MS ?? 60_000);
  return {
    max: Number.isInteger(max_raw) && max_raw >= 1 ? max_raw : 2000,
    window_ms: Number.isInteger(window_raw) && window_raw >= 1000 ? window_raw : 60_000,
  };
};

const anon_rate_limit = (_req, res, next) => {
  const { max, window_ms } = anon_rate_config();
  const now = Date.now();
  const cutoff = now - window_ms;
  while (hits.length && hits[0] <= cutoff) hits.shift();
  if (hits.length >= max) {
    res.set('Retry-After', String(Math.ceil(window_ms / 1000)));
    return res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes de medición. Inténtalo de nuevo en unos segundos.',
    });
  }
  hits.push(now);
  next();
};

const reset_anon_rate_limit = () => {
  hits.length = 0;
};

// Sólo números. Los tests comprueban que aquí no acaba ninguna IP.
const anon_rate_memory = () => hits.slice();

export { anon_rate_limit, anon_rate_memory, reset_anon_rate_limit };
