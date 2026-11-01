import { Router } from 'express';
import validate from '../middleware/validate_middleware.js';
import validate_object_id from '../middleware/validate_object_id.js';
import { allow, authenticate_agency } from '../middleware/agency_auth.js';
import { vault_limiter } from '../middleware/rate_limit.js';
import async_handler from '../utils/async_handler.js';
import {
  activity_schema,
  api_key_schema,
  create_client_schema,
  create_lead_schema,
  create_piece_schema,
  credential_schema,
  decision_schema,
  invoice_schema,
  meeting_schema,
  patch_api_key_schema,
  patch_client_schema,
  patch_lead_schema,
  patch_meeting_schema,
  patch_piece_schema,
  patch_report_schema,
  report_schema,
  version_schema,
} from '../schemas/agency_schema.js';
import * as leads from '../controllers/agency_leads_controller.js';
import * as clients from '../controllers/agency_clients_controller.js';
import * as pieces from '../controllers/agency_pieces_controller.js';
import * as vault from '../controllers/agency_vault_controller.js';
import * as billing from '../controllers/agency_billing_controller.js';
import * as keys from '../controllers/agency_keys_controller.js';
import * as privacy from '../controllers/agency_privacy_controller.js';

const router = Router();

const admin = allow({ roles: ['admin'] });
const read_leads = allow({ roles: ['admin'], scopes: ['leads:read'] });
const write_leads = allow({ roles: ['admin'], scopes: ['leads:write'] });
const read_clients = allow({ roles: ['admin', 'client'], scopes: ['clients:read'] });
const write_clients = allow({ roles: ['admin'], scopes: ['clients:write'] });
const read_pieces = allow({ roles: ['admin', 'client'], scopes: ['pieces:read'] });
const write_pieces = allow({ roles: ['admin'], scopes: ['pieces:write'] });
const read_approvals = allow({ roles: ['admin', 'client'], scopes: ['approvals:read'] });
const submit_piece = allow({ roles: ['admin'], scopes: ['approvals:write', 'pieces:write'] });
const read_reports = allow({ roles: ['admin', 'client'], scopes: ['reports:read'] });
const write_reports = allow({ roles: ['admin'], scopes: ['reports:write'] });
const read_meetings = allow({ roles: ['admin', 'client'], scopes: ['meetings:read'] });
const write_meetings = allow({ roles: ['admin'], scopes: ['meetings:write'] });
const read_invoices = allow({ roles: ['admin', 'client'], scopes: ['invoices:read'] });
const write_invoices = allow({ roles: ['admin'], scopes: ['invoices:write'] });
const snapshot = allow({ roles: ['admin', 'client'], scopes: ['snapshot:read', 'clients:read'] });
const vault_submit = allow({ roles: ['admin', 'client'], scopes: ['vault:write'] });
const vault_meta = allow({ roles: ['admin', 'client'], scopes: ['vault:read', 'vault:write'] });
const vault_open = allow({ roles: ['admin'], scopes: ['vault:read'] });
const events = allow({ roles: ['admin'], scopes: ['events:read'] });
const client_only = allow({ roles: ['client'] });

router.use(authenticate_agency);

router.get('/leads', read_leads, async_handler(leads.list_leads));
router.post('/leads', write_leads, validate(create_lead_schema), async_handler(leads.create_lead));
router.get(
  '/leads/:lead_id',
  validate_object_id('lead_id'),
  read_leads,
  async_handler(leads.get_lead)
);
router.patch(
  '/leads/:lead_id',
  validate_object_id('lead_id'),
  write_leads,
  validate(patch_lead_schema),
  async_handler(leads.patch_lead)
);
router.post(
  '/leads/:lead_id/activity',
  validate_object_id('lead_id'),
  write_leads,
  validate(activity_schema),
  async_handler(leads.add_activity)
);

router.get('/clients', read_clients, async_handler(clients.list_clients));
router.post(
  '/clients',
  write_clients,
  validate(create_client_schema),
  async_handler(clients.create_client)
);
router.get(
  '/clients/:client_id/snapshot',
  validate_object_id('client_id'),
  snapshot,
  async_handler(clients.snapshot)
);
router.post(
  '/clients/:client_id/portal-access',
  validate_object_id('client_id'),
  admin,
  async_handler(clients.portal_access)
);
router.get(
  '/clients/:client_id',
  validate_object_id('client_id'),
  read_clients,
  async_handler(clients.get_client)
);
router.patch(
  '/clients/:client_id',
  validate_object_id('client_id'),
  write_clients,
  validate(patch_client_schema),
  async_handler(clients.patch_client)
);

router.get(
  '/clients/:client_id/credentials',
  validate_object_id('client_id'),
  vault_meta,
  async_handler(vault.list_credentials)
);
router.post(
  '/clients/:client_id/credentials',
  validate_object_id('client_id'),
  vault_submit,
  validate(credential_schema),
  async_handler(vault.create_credential)
);
router.get(
  '/clients/:client_id/credential-audit',
  validate_object_id('client_id'),
  admin,
  async_handler(vault.list_audit)
);
router.post(
  '/credentials/:credential_id/decrypt',
  vault_limiter,
  validate_object_id('credential_id'),
  vault_open,
  async_handler(vault.decrypt_credential)
);
router.delete(
  '/credentials/:credential_id',
  validate_object_id('credential_id'),
  vault_submit,
  async_handler(vault.delete_credential)
);

router.get('/pieces', read_pieces, async_handler(pieces.list_pieces));
router.post(
  '/pieces',
  write_pieces,
  validate(create_piece_schema),
  async_handler(pieces.create_piece)
);
router.get(
  '/pieces/:piece_id',
  validate_object_id('piece_id'),
  read_pieces,
  async_handler(pieces.get_piece)
);
router.patch(
  '/pieces/:piece_id',
  validate_object_id('piece_id'),
  write_pieces,
  validate(patch_piece_schema),
  async_handler(pieces.patch_piece)
);
router.post(
  '/pieces/:piece_id/versions',
  validate_object_id('piece_id'),
  write_pieces,
  validate(version_schema),
  async_handler(pieces.add_version)
);
router.post(
  '/pieces/:piece_id/submit',
  validate_object_id('piece_id'),
  submit_piece,
  async_handler(pieces.submit)
);

router.get('/approvals', read_approvals, async_handler(pieces.list_approvals));
router.get(
  '/approvals/:approval_id',
  validate_object_id('approval_id'),
  read_approvals,
  async_handler(pieces.get_approval)
);
router.post(
  '/approvals/:approval_id/domingo',
  validate_object_id('approval_id'),
  admin,
  validate(decision_schema),
  async_handler(pieces.post_domingo)
);
router.post(
  '/approvals/:approval_id/client',
  validate_object_id('approval_id'),
  client_only,
  validate(decision_schema),
  async_handler(pieces.post_client)
);

router.get('/reports', read_reports, async_handler(billing.list_reports));
router.post(
  '/reports',
  write_reports,
  validate(report_schema),
  async_handler(billing.create_report)
);
router.patch(
  '/reports/:report_id',
  validate_object_id('report_id'),
  write_reports,
  validate(patch_report_schema),
  async_handler(billing.patch_report)
);

router.get('/meetings', read_meetings, async_handler(billing.list_meetings));
router.post(
  '/meetings',
  write_meetings,
  validate(meeting_schema),
  async_handler(billing.create_meeting)
);
router.patch(
  '/meetings/:meeting_id',
  validate_object_id('meeting_id'),
  write_meetings,
  validate(patch_meeting_schema),
  async_handler(billing.patch_meeting)
);

router.get('/invoices', read_invoices, async_handler(billing.list_invoices));
router.post(
  '/invoices',
  write_invoices,
  validate(invoice_schema),
  async_handler(billing.create_invoice)
);
router.post(
  '/invoices/:invoice_id/checkout',
  validate_object_id('invoice_id'),
  write_invoices,
  async_handler(billing.checkout_invoice)
);

router.get('/events', events, async_handler(billing.list_events));

router.get('/keys', admin, async_handler(keys.list_keys));
router.post('/keys', admin, validate(api_key_schema), async_handler(keys.create_key));
router.patch(
  '/keys/:key_id',
  validate_object_id('key_id'),
  admin,
  validate(patch_api_key_schema),
  async_handler(keys.patch_key)
);
router.delete('/keys/:key_id', validate_object_id('key_id'), admin, async_handler(keys.revoke_key));

router.get(
  '/privacy/leads/:lead_id',
  validate_object_id('lead_id'),
  admin,
  async_handler(privacy.export_lead)
);
router.delete(
  '/privacy/leads/:lead_id',
  validate_object_id('lead_id'),
  admin,
  async_handler(privacy.erase_lead)
);
router.get(
  '/privacy/clients/:client_id',
  validate_object_id('client_id'),
  admin,
  async_handler(privacy.export_client)
);
router.delete(
  '/privacy/clients/:client_id',
  validate_object_id('client_id'),
  admin,
  async_handler(privacy.erase_client)
);

export default router;
