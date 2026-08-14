import Client from '../models/client_model.js';
import SupportTicket from '../models/support_ticket_model.js';
import { get_client_billing } from '../services/billing_service.js';
import { analyze_ticket } from '../services/ingeniero_service.js';
import { PLANS, LEGACY_PLAN_INFO, EMPLOYEE_NAMES } from '../config/plans.js';
import { notify_ops } from '../services/ops_notify_service.js';

const AI_PLAN_SLUGS = new Set(['individual', 'estudio', 'clinica']);

// ─── GET /api/portal/me ────────────────────────────────────────────────────
// Single endpoint that returns everything the portal dashboard needs.
// All queries run in parallel — one round-trip to the DB per request.
const get_portal_me = async (req, res, next) => {
  try {
    const client_id = req.user.client_id;

    const [client, { payments, subscription }, open_tickets] = await Promise.all([
      Client.findById(client_id).select(
        'name email plan status company country created_at active_employees onboarding_status office_url office_status office_plan office_instance_id office_deployed_at'
      ),
      get_client_billing(client_id),
      SupportTicket.countDocuments({ client_id, status: { $in: ['open', 'in_progress'] } }),
    ]);

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // Shape purchases for the frontend
    const purchases = payments.map((p) => ({
      id:                 p._id,
      type:               p.type ?? 'manual',
      reference_slug:     p.reference_slug ?? null,
      reference_label:    p.reference_label ?? p.description ?? 'Pago',
      amount:             p.amount,
      currency:           p.currency,
      receipt_url:        p.receipt_url ?? null,
      installment_number: p.installment_number ?? null,
      installment_total:  p.installment_total  ?? null,
      created_at:         p.created_at,
    }));

    // Upcoming payments: subscription billing + pending installments
    const upcoming = [];

    if (subscription?.next_billing_date) {
      upcoming.push({
        type:     'subscription',
        label:    subscription.package_slug,
        amount:   subscription.amount_monthly ?? null,
        due_date: subscription.next_billing_date,
      });
    }

    // Pending installments: find bolsa/manual payments where there are remaining cuotas
    // Group by reference_label and find the highest installment_number paid per group
    const installment_payments = payments.filter(
      (p) => p.installment_total > 1 && p.installment_number != null
    );

    const installment_groups = {};
    for (const p of installment_payments) {
      const key = `${p.type}::${p.reference_label}`;
      if (!installment_groups[key] || p.installment_number > installment_groups[key].installment_number) {
        installment_groups[key] = p;
      }
    }

    for (const last_paid of Object.values(installment_groups)) {
      const remaining = last_paid.installment_total - last_paid.installment_number;
      if (remaining > 0) {
        upcoming.push({
          type:          last_paid.type,
          label:         `${last_paid.reference_label} — cuota ${last_paid.installment_number + 1}/${last_paid.installment_total}`,
          amount:        last_paid.amount, // same amount per installment
          due_date:      null, // admin issues the link when it's time
          pending_link:  true, // frontend shows "pendiente de enlace de pago"
        });
      }
    }

    res.json({
      success: true,
      data: {
        client: {
          name:              client.name,
          email:             client.email,
          plan:              client.plan,
          status:            client.status,
          company:           client.company ?? null,
          country:           client.country ?? null,
          member_since:      client.created_at,
          active_employees:  client.active_employees ?? [],
          onboarding_status: client.onboarding_status ?? null,
          office: {
            url:         client.office_url ?? null,
            status:      client.office_status ?? 'not_requested',
            plan:        client.office_plan ?? null,
            instance_id: client.office_instance_id ?? null,
            deployed_at: client.office_deployed_at ?? null,
          },
        },
        purchases,
        subscription: subscription
          ? {
              package_slug:      subscription.package_slug,
              status:            subscription.status,
              amount_monthly:    subscription.amount_monthly ?? null,
              next_billing_date: subscription.next_billing_date ?? null,
              minimum_end_date:  subscription.minimum_end_date ?? null,
              started_at:        subscription.started_at,
            }
          : null,
        upcoming,
        open_tickets,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/portal/tickets ───────────────────────────────────────────────
const get_portal_tickets = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find({ client_id: req.user.client_id }).sort({ created_at: -1 });
    res.json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/portal/support ──────────────────────────────────────────────
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

    analyze_ticket(ticket._id).catch((err) =>
      console.error(`Ingeniero failed to analyze ticket ${ticket._id}:`, err.message)
    );

    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/portal/plan ──────────────────────────────────────────────────
// Returns the client's active AI plan, contracted employees and onboarding status.
// Only meaningful for clients on an AI plan (individual / estudio / clinica).
const get_portal_plan = async (req, res, next) => {
  try {
    const client = await Client.findById(req.user.client_id).select(
      'plan active_employees onboarding_status setup_fee_paid status office_url office_status office_plan office_instance_id office_deployed_at'
    );

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const is_ai_plan = AI_PLAN_SLUGS.has(client.plan);

    const plan_config = PLANS[client.plan] ?? LEGACY_PLAN_INFO[client.plan] ?? null;

    const employees = (client.active_employees ?? []).map(slug => ({
      slug,
      name:   EMPLOYEE_NAMES[slug] ?? slug,
      active: client.status === 'active',
    }));

    res.json({
      success: true,
      data: {
        plan:               client.plan,
        plan_name:          plan_config?.name ?? client.plan,
        monthly_amount:     plan_config?.monthly ?? null,
        is_ai_plan,
        onboarding_status:  client.onboarding_status ?? null,
        setup_fee_paid:     client.setup_fee_paid,
        status:             client.status,
        office: {
          url:         client.office_url ?? null,
          status:      client.office_status ?? 'not_requested',
          plan:        client.office_plan ?? null,
          instance_id: client.office_instance_id ?? null,
          deployed_at: client.office_deployed_at ?? null,
        },
        employees,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/portal/onboarding ────────────────────────────────────────────
const get_portal_onboarding = async (req, res, next) => {
  try {
    const client = await Client.findById(req.user.client_id).select(
      'onboarding_form onboarding_status office_status office_plan office_url'
    );
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

    res.json({
      success: true,
      data: {
        form:              client.onboarding_form ?? {},
        onboarding_status: client.onboarding_status ?? 'pending_form',
        office_status:     client.office_status ?? 'not_requested',
        office_plan:       client.office_plan ?? null,
        office_url:        client.office_url ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/portal/onboarding ───────────────────────────────────────────
// The client fills the form so the owner can provision their office instance.
const save_portal_onboarding = async (req, res, next) => {
  try {
    const allowed = [
      'business_name', 'sector', 'timezone', 'locale',
      'slack_workspace', 'slack_bot_token', 'slack_signing_secret', 'slack_default_channel',
      'materials_link', 'additional_notes',
    ];
    const incoming = req.body ?? {};
    const update = { submitted_at: new Date() };
    for (const key of allowed) {
      if (typeof incoming[key] === 'string') update[key] = incoming[key].trim();
    }

    if (!update.business_name) {
      return res.status(400).json({ success: false, message: 'business_name is required' });
    }

    const client = await Client.findByIdAndUpdate(
      req.user.client_id,
      {
        $set: {
          onboarding_form: update,
          // Move forward from pending_form → configuring when the form is first submitted.
          ...(req.body?.advance_status === false ? {} : { onboarding_status: 'configuring' }),
        },
      },
      { new: true },
    ).select('name email onboarding_form onboarding_status office_status office_plan');

    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

    // Ops alert: the form is ready, owner can provision now.
    notify_ops([
      ':inbox_tray: *Onboarding form completado*',
      `*Cliente:* ${client.name} (${client.email}) — id: \`${client._id}\``,
      `*Negocio:* ${client.onboarding_form?.business_name ?? '?'} · *Sector:* ${client.onboarding_form?.sector ?? '?'}`,
      `*Timezone:* ${client.onboarding_form?.timezone ?? '?'} · *Plan:* ${client.office_plan ?? '?'}`,
      client.onboarding_form?.materials_link ? `*Materiales:* ${client.onboarding_form.materials_link}` : '',
      client.onboarding_form?.additional_notes ? `*Notas:* ${client.onboarding_form.additional_notes}` : '',
    ].filter(Boolean).join('\n')).catch(() => {});

    res.json({
      success: true,
      data: {
        form: client.onboarding_form,
        onboarding_status: client.onboarding_status,
        office_status: client.office_status,
      },
    });
  } catch (err) {
    next(err);
  }
};

export {
  get_portal_me,
  get_portal_tickets,
  create_support_ticket,
  get_portal_plan,
  get_portal_onboarding,
  save_portal_onboarding,
};
