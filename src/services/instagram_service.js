// Thin wrapper around the Meta Graph API for Instagram messaging.
// Requires env vars:
//   INSTAGRAM_ACCESS_TOKEN  — long-lived Page access token
//   INSTAGRAM_PAGE_ID       — numeric Instagram Page ID (used for DMs)

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

// ── DMs ─────────────────────────────────────────────────────────────────────

/**
 * Sends a DM to an Instagram user.
 * recipient_id: IGSID (Instagram-scoped user ID)
 */
const send_dm = async (recipient_id, text) => {
  const res = await fetch(`${GRAPH_URL}/me/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      recipient:  { id: recipient_id },
      message:    { text },
      messaging_type: 'RESPONSE',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Instagram DM error: ${data.error?.message ?? res.statusText}`);
  }
  return data;
};

// ── Comments ─────────────────────────────────────────────────────────────────

/**
 * Replies to a public Instagram comment.
 * comment_id: the comment's ID from the webhook payload
 */
const reply_to_comment = async (comment_id, text) => {
  const res = await fetch(`${GRAPH_URL}/${comment_id}/replies`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ message: text }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Instagram comment reply error: ${data.error?.message ?? res.statusText}`);
  }
  return data;
};

/**
 * Gets the username and name of an Instagram user by IGSID.
 * Useful to enrich lead data when a conversation starts.
 */
const get_user_profile = async (igsid) => {
  const res = await fetch(
    `${GRAPH_URL}/${igsid}?fields=name,username&access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`
  );
  const data = await res.json();
  if (!res.ok) return { name: null, username: null };
  return { name: data.name ?? null, username: data.username ?? null };
};

export { send_dm, reply_to_comment, get_user_profile };
