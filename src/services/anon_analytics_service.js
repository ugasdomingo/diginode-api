import AnonCounter from '../models/anon_counter_model.js';
import {
  ANON_EVENT_TYPES,
  CONTACT_LOCATIONS,
  CONTACT_TYPES,
  DEVICES,
  day_in_madrid,
  geo_from_proxy_headers,
  parse_country_code,
  parse_domain,
  parse_lang,
  parse_path,
  parse_utm,
  shift_madrid_day,
} from './measurement_fields.js';

// El cuerpo puede traer IP, cookie o visitor_id: se ignoran. Sólo salen estas claves.
const parse_anon_payload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false };

  if (!ANON_EVENT_TYPES.includes(body.type)) return { ok: false };
  const path = parse_path(body.path);
  if (!path) return { ok: false };

  const referrer_domain = parse_domain(body.referrer_domain);
  const utm_source = parse_utm(body.utm_source);
  const utm_medium = parse_utm(body.utm_medium);
  const utm_campaign = parse_utm(body.utm_campaign);
  if (referrer_domain == null || utm_source == null || utm_medium == null || utm_campaign == null) {
    return { ok: false };
  }
  if (!DEVICES.includes(body.device)) return { ok: false };
  const lang = parse_lang(body.lang);
  if (!lang) return { ok: false };

  let contact_type = '';
  let location = '';
  if (body.type === 'contact_click') {
    if (!CONTACT_TYPES.includes(body.contact_type)) return { ok: false };
    contact_type = body.contact_type;
    if (body.location == null || body.location === '') location = '';
    else if (!CONTACT_LOCATIONS.includes(body.location)) return { ok: false };
    else location = body.location;
  } else if (
    (body.contact_type != null && body.contact_type !== '') ||
    (body.location != null && body.location !== '')
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      type: body.type,
      path,
      referrer_domain,
      utm_source,
      utm_medium,
      utm_campaign,
      device: body.device,
      lang,
      contact_type,
      location,
    },
  };
};

const bucket_of = (dimensions, now = new Date()) => ({
  day: day_in_madrid(now),
  path: dimensions.path,
  referrer_domain: dimensions.referrer_domain,
  utm_source: dimensions.utm_source,
  utm_medium: dimensions.utm_medium,
  utm_campaign: dimensions.utm_campaign,
  device: dimensions.device,
  lang: dimensions.lang,
  country: dimensions.country || '',
  city: dimensions.city || '',
  type: dimensions.type,
  contact_type: dimensions.contact_type || '',
  location: dimensions.location || '',
});

const record_anon_hit = async (dimensions, now = new Date()) => {
  const filter = bucket_of(dimensions, now);
  const existing = await AnonCounter.updateOne(filter, { $inc: { count: 1 } });
  if (existing.matchedCount > 0) return;
  try {
    await AnonCounter.create({ ...filter, count: 1 });
  } catch (err) {
    // Dos altas a la vez pueden chocar en el índice único: el segundo sólo suma.
    if (err?.code !== 11000) throw err;
    await AnonCounter.updateOne(filter, { $inc: { count: 1 } });
  }
};

const parse_anon_filters = (query = {}) => {
  let days = 30;
  if (query.days != null && query.days !== '') {
    if (typeof query.days !== 'string' && typeof query.days !== 'number') return { ok: false };
    if (!/^\d{1,3}$/.test(String(query.days))) return { ok: false };
    days = Math.min(Math.max(parseInt(query.days, 10), 1), 366);
  }

  const filters = { days };
  if (query.path != null && query.path !== '') {
    if (typeof query.path !== 'string') return { ok: false };
    const path = parse_path(query.path);
    if (!path) return { ok: false };
    filters.path = path;
  }
  if (query.referrer_domain != null) {
    if (typeof query.referrer_domain !== 'string') return { ok: false };
    const domain = parse_domain(query.referrer_domain);
    if (domain == null) return { ok: false };
    filters.referrer_domain = domain;
  }
  if (query.utm_source != null && query.utm_source !== '') {
    if (typeof query.utm_source !== 'string') return { ok: false };
    const utm = parse_utm(query.utm_source);
    if (utm == null) return { ok: false };
    filters.utm_source = utm;
  }
  if (query.device != null && query.device !== '') {
    if (typeof query.device !== 'string' || !DEVICES.includes(query.device)) return { ok: false };
    filters.device = query.device;
  }
  if (query.lang != null && query.lang !== '') {
    if (typeof query.lang !== 'string') return { ok: false };
    const lang = parse_lang(query.lang);
    if (!lang) return { ok: false };
    filters.lang = lang;
  }
  if (query.country != null && query.country !== '') {
    if (typeof query.country !== 'string') return { ok: false };
    const country = parse_country_code(query.country);
    if (!country) return { ok: false };
    filters.country = country;
  }
  return { ok: true, value: filters };
};

const sum_if = (condition) => ({ $sum: { $cond: [condition, '$count', 0] } });

const group_metrics = (id) => ({
  _id: id,
  pageviews: sum_if({ $eq: ['$type', 'pageview'] }),
  contact_clicks: sum_if({ $eq: ['$type', 'contact_click'] }),
  call: sum_if({ $and: [{ $eq: ['$type', 'contact_click'] }, { $eq: ['$contact_type', 'call'] }] }),
  whatsapp: sum_if({
    $and: [{ $eq: ['$type', 'contact_click'] }, { $eq: ['$contact_type', 'whatsapp'] }],
  }),
  form: sum_if({ $and: [{ $eq: ['$type', 'contact_click'] }, { $eq: ['$contact_type', 'form'] }] }),
});

const as_rows = (list, key) =>
  list.map((row) => ({
    [key]: row._id ? row._id : null,
    pageviews: row.pageviews,
    contact_clicks: row.contact_clicks,
    call: row.call,
    whatsapp: row.whatsapp,
    form: row.form,
  }));

const get_anon_summary = async (filters = {}) => {
  const days = Math.min(Math.max(Number(filters.days) || 30, 1), 366);
  const to_day = day_in_madrid();
  const from_day = shift_madrid_day(to_day, -(days - 1));
  const match = { day: { $gte: from_day, $lte: to_day } };
  for (const key of ['path', 'referrer_domain', 'utm_source', 'device', 'lang', 'country']) {
    if (Object.prototype.hasOwnProperty.call(filters, key) && filters[key] != null) match[key] = filters[key];
  }

  const dimension = (field, limit) => {
    const stages = [
      { $group: group_metrics(`$${field}`) },
      { $sort: { contact_clicks: -1, pageviews: -1, _id: 1 } },
    ];
    if (limit) stages.push({ $limit: limit });
    return stages;
  };

  const [result] = await AnonCounter.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [{ $group: group_metrics(null) }],
        by_day: [{ $group: group_metrics('$day') }, { $sort: { _id: 1 } }],
        by_path: dimension('path', 50),
        by_referrer_domain: dimension('referrer_domain', 50),
        by_utm_source: dimension('utm_source', 50),
        by_utm_medium: dimension('utm_medium', 50),
        by_utm_campaign: dimension('utm_campaign', 50),
        by_device: dimension('device'),
        by_lang: dimension('lang', 50),
        by_country: dimension('country', 300),
        by_city: dimension('city', 30),
        by_location: [
          { $match: { type: 'contact_click' } },
          { $group: group_metrics('$location') },
          { $sort: { contact_clicks: -1, _id: 1 } },
        ],
      },
    },
  ]);

  const facet = result ?? {};
  const totals = facet.totals?.[0] ?? {
    pageviews: 0,
    contact_clicks: 0,
    call: 0,
    whatsapp: 0,
    form: 0,
  };

  return {
    range_days: days,
    from_day,
    to_day,
    totals: {
      pageviews: totals.pageviews ?? 0,
      contact_clicks: totals.contact_clicks ?? 0,
      call: totals.call ?? 0,
      whatsapp: totals.whatsapp ?? 0,
      form: totals.form ?? 0,
    },
    by_day: as_rows(facet.by_day ?? [], 'day'),
    by_path: as_rows(facet.by_path ?? [], 'path'),
    by_referrer_domain: as_rows(facet.by_referrer_domain ?? [], 'referrer_domain'),
    by_utm_source: as_rows(facet.by_utm_source ?? [], 'utm_source'),
    by_utm_medium: as_rows(facet.by_utm_medium ?? [], 'utm_medium'),
    by_utm_campaign: as_rows(facet.by_utm_campaign ?? [], 'utm_campaign'),
    by_device: as_rows(facet.by_device ?? [], 'device'),
    by_lang: as_rows(facet.by_lang ?? [], 'lang'),
    by_country: as_rows(facet.by_country ?? [], 'country'),
    by_city: as_rows(facet.by_city ?? [], 'city'),
    by_location: as_rows(facet.by_location ?? [], 'location'),
  };
};

export { geo_from_proxy_headers, get_anon_summary, parse_anon_filters, parse_anon_payload, record_anon_hit };
