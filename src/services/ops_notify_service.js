// Lightweight ops notifications. Today: Slack incoming webhook. Tomorrow:
// could fan out to email/telegram. Designed to never throw — webhook failures
// should not block Stripe webhook handling.

const send_to_slack = async (text) => {
  const webhook = process.env.DIGINODE_OPS_SLACK_WEBHOOK;
  if (!webhook) return { ok: false, reason: 'webhook_not_configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.OPS_SLACK_TIMEOUT_MS ?? 5000));
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return { ok: response.ok };
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
};

const slugify = (value) =>
  (value ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'cliente';

export const notify_office_requested = async ({ client, plan, employees, source, amount, currency }) => {
  try {
    const slug = slugify(client?.email ?? client?.full_name);
    const email = client?.email ?? 'sin-email';
    const name = client?.full_name ?? email;
    const employeesText = Array.isArray(employees) && employees.length > 0 ? employees.join(', ') : 'sin-empleados';
    const amountText = typeof amount === 'number' && currency
      ? `${amount.toFixed(2)} ${currency}`
      : 'monto-desconocido';

    const text = [
      ':rocket: *Nuevo cliente pagó* — provisionar oficina',
      `*Cliente:* ${name} (${email}) — id Mongo: \`${client?._id ?? '?'}\``,
      `*Plan:* ${plan ?? '?'} · *Empleados:* ${employeesText}`,
      `*Origen:* ${source ?? '?'} · *Importe:* ${amountText}`,
      '',
      '*Comando sugerido en diginode-office:*',
      `\`\`\`pnpm provision ${slug} ${plan ?? 'individual'} --name="Oficina ${name}"\`\`\``,
      '',
      `Después actualizar admin: office_url, office_status=live, office_instance_id=${slug}.`,
    ].join('\n');

    return await send_to_slack(text);
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'unexpected' };
  }
};

export const notify_ops = async (text) => send_to_slack(text);
