import Client from '../models/client_model.js';
import Lead from '../models/lead_model.js';

// Called when Cal.com fires BOOKING_CREATED
const handle_meeting_booked = async ({ booking_id, attendee_email, attendee_name }) => {
  let lead = await Lead.findOne({
    $or: [
      { contact_id: attendee_email },
      { name: { $regex: attendee_name, $options: 'i' } },
    ],
  });

  if (lead) {
    lead.status = 'meeting_booked';
    lead.cal_booking_id = booking_id;
    if (attendee_name && !lead.name) lead.name = attendee_name;
    await lead.save();
  } else {
    lead = await Lead.create({
      contact_id: attendee_email,
      platform:   'website',
      name:       attendee_name,
      status:     'meeting_booked',
      cal_booking_id: booking_id,
    });
  }

  return lead;
};

// Marks a lead as won and creates the client record manually (used from admin dashboard)
const convert_lead_to_client = async (lead_id, client_data) => {
  const lead = await Lead.findByIdAndUpdate(lead_id, { status: 'won' }, { new: true });

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

  return client;
};

export { handle_meeting_booked, convert_lead_to_client };
