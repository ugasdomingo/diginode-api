const LEAD_HIDDEN = [
  'chat_history',
  'demo_lock_token',
  'demo_lock_until',
  'request_hash',
  'notification_lock_until',
];

const as_object = (doc) => (doc?.toObject ? doc.toObject() : { ...doc });

export const present_lead = (lead) => {
  if (!lead) return null;
  const obj = as_object(lead);
  for (const key of LEAD_HIDDEN) delete obj[key];
  obj.business = obj.company || null;
  return obj;
};

// Agency responses never carry office tokens or Slack secrets, even for admin.
// Those stay on the existing admin office endpoints.
export const present_client = (client) => {
  if (!client) return null;
  const obj = as_object(client);
  delete obj.office_admin_token;
  if (obj.onboarding_form) {
    obj.onboarding_form = { ...obj.onboarding_form };
    delete obj.onboarding_form.slack_bot_token;
    delete obj.onboarding_form.slack_signing_secret;
  }
  return obj;
};
