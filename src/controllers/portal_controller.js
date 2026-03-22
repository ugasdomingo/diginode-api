import Client from '../models/client_model.js';
import SupportTicket from '../models/support_ticket_model.js';
import { get_invoices } from '../services/billing_service.js';
import { analyze_ticket } from '../services/ingeniero_service.js';

// GET /api/portal/invoices
const get_portal_invoices = async (req, res, next) => {
  try {
    const invoices = await get_invoices(req.user.client_id);
    res.json({ success: true, data: invoices });
  } catch (err) {
    next(err);
  }
};

// GET /api/portal/services
const get_portal_services = async (req, res, next) => {
  try {
    const client = await Client.findById(req.user.client_id).select('name plan services status');

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    res.json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
};

// GET /api/portal/tickets
const get_portal_tickets = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find({ client_id: req.user.client_id }).sort({ created_at: -1 });
    res.json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
};

// POST /api/portal/support
const create_support_ticket = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'title and description are required' });
    }

    const ticket = await SupportTicket.create({
      client_id: req.user.client_id,
      title,
      description,
    });

    // Run El Ingeniero in the background — don't block the response
    analyze_ticket(ticket._id).catch((err) =>
      console.error(`Ingeniero failed to analyze ticket ${ticket._id}:`, err.message)
    );

    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
};

export { get_portal_invoices, get_portal_services, get_portal_tickets, create_support_ticket };
