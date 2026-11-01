import {
  erase_client_tracking,
  erase_lead_tracking,
  erase_visitor,
  export_client,
  export_lead,
} from '../services/privacy_service.js';

const actor_of = (req) => req.user._id;

const export_lead_privacy = async (req, res, next) => {
  try {
    const data = await export_lead(req.params.lead_id, actor_of(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const export_client_privacy = async (req, res, next) => {
  try {
    const data = await export_client(req.params.client_id, actor_of(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const erase_lead_privacy = async (req, res, next) => {
  try {
    const erased = await erase_lead_tracking(req.params.lead_id, actor_of(req));
    res.json({ success: true, erased });
  } catch (err) {
    next(err);
  }
};

const erase_client_privacy = async (req, res, next) => {
  try {
    const erased = await erase_client_tracking(req.params.client_id, actor_of(req));
    res.json({ success: true, erased });
  } catch (err) {
    next(err);
  }
};

const erase_visitor_privacy = async (req, res, next) => {
  try {
    const erased = await erase_visitor(req.params.visitor_id, actor_of(req));
    res.json({ success: true, erased });
  } catch (err) {
    next(err);
  }
};

export {
  erase_client_privacy,
  erase_lead_privacy,
  erase_visitor_privacy,
  export_client_privacy,
  export_lead_privacy,
};
