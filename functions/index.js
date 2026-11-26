// Shout server functions: push notifications for new chat messages.
// Uses standard Web Push (works on iPhone home-screen apps, Android and desktop browsers).
// The signing keys are made on first use and kept in Firestore at config/push, which the app can't read.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import webpush from 'web-push';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'australia-southeast1', maxInstances: 5, memory: '256MiB' });

let keysP = null;
function vapidKeys() {
  keysP ??= db.runTransaction(async (tx) => {
    const ref = db.doc('config/push');
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().publicKey) return snap.data();
    const k = webpush.generateVAPIDKeys();
    tx.set(ref, { publicKey: k.publicKey, privateKey: k.privateKey, at: Date.now() });
    return k;
  }).catch((e) => {
    keysP = null;
    throw e;
  });
  return keysP;
}

async function sendTo(uids, payloadFor) {
  const k = await vapidKeys();
  const opts = {
    vapidDetails: { subject: 'https://shout-families.web.app', publicKey: k.publicKey, privateKey: k.privateKey },
    TTL: 60 * 60 * 12,
    urgency: 'high',
  };
  let sent = 0;
  await Promise.all(
    uids.map(async (uid) => {
      const payload = typeof payloadFor === 'function' ? payloadFor(uid) : payloadFor;
      const body = JSON.stringify(payload);
      const topic = payload.tag ? payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : undefined;
      const subs = await db.collection(`users/${uid}/push`).get();
      await Promise.all(
        subs.docs.map(async (d) => {
          const s = d.data();
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { ...opts, topic });
            sent++;
          } catch (e) {
            // Gone or invalid: the phone unsubscribed or the app was deleted.
            if ([404, 410].includes(e.statusCode) || (e.statusCode === 403 && /BadJwt|Expired/.test(e.body ?? ''))) {
              await d.ref.delete().catch(() => {});
            } else {
              logger.warn('push failed', { uid, status: e.statusCode, body: e.body });
            }
          }
        }),
      );
    }),
  );
  return sent;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function describe(m, authorName) {
  let text = (m.text ?? '').trim();
  if (!text && m.link) text = m.link.platform === 'web' ? 'shared a link' : m.link.platform === 'tiktok' ? 'shared a TikTok' : 'shared a reel';
  else if (!text && m.photoId) text = 'sent a photo';
  if (!text) return null;
  const extras = [m.tokens?.who, m.tokens?.where, m.tokens?.when].filter(Boolean);
  if (extras.length) text += ` · ${extras.join(' · ')}`;
  const shared = /^(shared|sent) /.test(text) && !m.text;
  return clip(shared ? `${authorName} ${text}` : `${authorName}: ${text}`, 180);
}

export const notifyMessage = onDocumentCreated('groups/{gid}/chats/{cid}/messages/{mid}', async (event) => {
  const m = event.data?.data();
  if (!m || m.dismissed) return;
  const { gid, cid } = event.params;
  const [gSnap, cSnap] = await Promise.all([db.doc(`groups/${gid}`).get(), db.doc(`groups/${gid}/chats/${cid}`).get()]);
  if (!gSnap.exists || !cSnap.exists) return;
  const group = gSnap.data();
  const chat = cSnap.data();
  const author = group.members?.[m.authorId]?.name ?? (String(m.authorId).startsWith('guest:') ? String(m.authorId).slice(6) : 'Someone');
  const body = describe(m, author);
  if (!body) return;

  const inGroup = new Set(group.memberIds ?? []);
  const to = (chat.memberIds ?? []).filter((id) => id !== m.authorId && inGroup.has(id));
  if (!to.length) return;

  // Title is what the chat is called on the recipient's own chat list.
  const titleFor = (uid) => {
    if (chat.kind === 'fun') return `${group.name} · Fun`;
    if (chat.name) return chat.name;
    if (chat.everyone) return group.name;
    const others = (chat.memberIds ?? []).filter((id) => id !== uid).map((id) => group.members?.[id]?.name).filter(Boolean);
    return others.join(', ') || group.name;
  };

  const sent = await sendTo(to, (uid) => ({ title: titleFor(uid), body, url: `/#/chat/${cid}?g=${gid}`, tag: `${gid}-${cid}` }));
  logger.info('notified', { gid, cid, to: to.length, sent });
});

// The public half of the signing key, which phones need to subscribe.
export const pushKey = onRequest(async (_req, res) => {
  const k = await vapidKeys();
  res.set('Cache-Control', 'public, max-age=300').json({ publicKey: k.publicKey });
});

// "Send me a test" from the Me tab.
export const pushTest = onRequest(async (req, res) => {
  if (req.method !== 'POST') return void res.status(405).send('POST only');
  const token = (req.get('Authorization') ?? '').replace(/^Bearer /, '');
  let uid;
  try {
    uid = (await getAuth().verifyIdToken(token)).uid;
  } catch {
    return void res.status(401).send('Sign in first');
  }
  const sent = await sendTo([uid], { title: 'Shout', body: 'Notifications are working 👍', url: '/#/me', tag: 'test', test: true });
  res.json({ sent });
});
