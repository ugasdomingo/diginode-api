// Proposal questionnaire: closed answers so pricing never depends on free text.
export const QUESTIONNAIRE = {
  sector: ['distribution', 'hospitality', 'retail', 'services', 'health', 'other'],
  employees: ['1-2', '3-5', '6-10', '11-20', '21-50', '50+'],
  locations: ['1', '2-3', '4+'],
  revenue: ['lt150k', '150k-500k', '500k-2m', 'gt2m', 'unknown'],
  country: ['ES', 'MX', 'CO', 'AR', 'CL', 'PE', 'other_latam', 'other'],
  reasons: ['few_clients', 'no_results', 'no_time', 'weak_brand', 'grow'],
  channels: ['instagram', 'facebook', 'tiktok', 'linkedin', 'google', 'whatsapp', 'telegram', 'web'],
  marketing_spend: ['none', 'lt500', '500-1500', '1500-3000', 'gt3000', 'unknown'],
  new_clients: ['0-5', '6-20', '21-50', '50+', 'unknown'],
  web_goals: ['sell_online', 'quotes', 'bookings', 'contact', 'operations', 'other'],
  brand_identity: ['yes', 'partial', 'no'],
  deadline: ['lt1m', '1-3m', 'flexible'],
};

export const LATAM = ['MX', 'CO', 'AR', 'CL', 'PE', 'other_latam'];
export const VAT_RATE = 21;
