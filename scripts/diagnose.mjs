// Read-only health check for notifications. Prints counts only (the repo's Action logs are public).
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'shout-families' });
const db = getFirestore();
const hours = (t) => (t ? `${((Date.now() - t) / 3600000).toFixed(1)}h ago` : 'never');

const cfg = await db.doc('config/pushPublic').get();
console.log('Signing key created:', cfg.exists);
const users = await db.collection('users').get();
let i = 0;
for (const u of users.docs) {
  i++;
  const subs = await u.ref.collection('push').get();
  const reqs = await u.ref.collection('pushRequests').get();
  const kinds = reqs.docs.map((d) => `${d.data().kind}:${d.data().done ? `done(sent ${d.data().sent})` : 'NOT done'}`);
  const kindOf = (e) => (e.includes('apple') ? 'iPhone' : e.includes('fcm.googleapis') ? 'Chrome/Android' : e.includes('mozilla') ? 'Firefox' : 'other');
  console.log(`Person ${i}: ${subs.size} phone(s) [${subs.docs.map((d) => `${kindOf(d.data().endpoint)} saved ${hours(d.data().at)}`).join(', ')}] · requests [${kinds.join(', ')}]`);
}
