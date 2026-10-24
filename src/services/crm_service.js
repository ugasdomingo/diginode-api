import Client from '../models/client_model.js';
import Lead from '../models/lead_model.js';

// Called when Cal.com fires BOOKING_CREATED
const handle_meeting_booked = async ({ booking_id, attendee_email, attendee_name }) => {
  if (typeof booking_id !== 'string' || !booking_id || booking_id.length > 200) return null;
  const email = String(attendee_email ?? '').trim().toLowerCase();
  if (!email) return null;
  const already_linked = await Lead.findOne({ cal_booking_id: booking_id });
  if (already_linked) return already_linked;
  const matches = await Lead.find({ email }).limit(2);
  if (matches.length > 1) {
    await Lead.updateMany({ _id: { $in: matches.map(lead => lead._id) } }, { $addToSet: { booking_review_ids: booking_id } });
    return null; // Retain a visible review flag rather than associating the wrong request.
  }
  let lead = matches[0];

  if (lead) {
    if (!['won', 'lost'].includes(lead.status)) { lead.status = 'meeting_booked'; lead.funnel_stage = 'meeting_booked'; }
    lead.cal_booking_id = booking_id;
    if (attendee_name && !lead.name) lead.name = attendee_name;
    await lead.save();
  } else {
    lead = await Lead.create({
      contact_id: 'booking-' + booking_id,
      email,
      platform:   'website',
      name:       attendee_name,
      status:     'meeting_booked',
      funnel_stage: 'meeting_booked',
      cal_booking_id: booking_id,
    });
  }

  return lead;
};

// Marks a lead as won and creates the client record manually (used from admin dashboard)
const convert_lead_to_client = async (lead_id, client_data) => {
  const lead = await Lead.findById(lead_id);
  if (lead && ['brand_management', 'web_project', 'undecided'].includes(lead.service_interest)) throw Object.assign(new Error('Gestión y proyectos requieren contrato y alta asistida.'), { status_code: 409 });

  if (!lead) {
    const err = new Error('Lead not found');
    err.status_code = 404;
    throw err;
  }

  const client = await Client.create({
    ...client_data,
    lead_id: lead._id,
    status:  'pending',
  });

  lead.status = 'won';
  lead.funnel_stage = 'won';
  await lead.save();
  return client;
};

export { handle_meeting_booked, convert_lead_to_client };
