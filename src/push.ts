import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/** Where the app stands on notifications for this phone. */
export type PushState =
  | 'unsupported' // browser can't do web push
  | 'install' // iPhone/iPad: needs adding to the Home Screen first
  | 'blocked' // person said no; only fixable in phone settings
  | 'off' // can ask
  | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

let reg: Promise<ServiceWorkerRegistration | null> | null = null;
export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.VITE_EMU === '1') return Promise.resolve(null);
  reg ??= navigator.serviceWorker.register('/sw.js').catch(() => null);
  return reg;
}

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const r = await registerSW();
  const sub = await r?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function subId(endpoint: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(h).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function saveSub(sub: PushSubscription) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const j = sub.toJSON();
  await setDoc(doc(db, 'users', uid, 'push', await subId(sub.endpoint)), {
    endpoint: sub.endpoint,
    keys: j.keys,
    ua: navigator.userAgent.slice(0, 200),
    at: Date.now(),
  });
}

/** Must be called from a tap (iPhone only allows asking then). */
export async function turnOnPush(): Promise<PushState> {
  const state = await pushState();
  if (state === 'install' || state === 'unsupported' || state === 'blocked') return state;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  const r = await registerSW();
  if (!r) return 'unsupported';
  await navigator.serviceWorker.ready;
  let sub = await r.pushManager.getSubscription();
  if (!sub) {
    const res = await fetch('/api/pushKey');
    if (!res.ok) throw new Error('Notifications aren’t set up on the server yet');
    const { publicKey } = (await res.json()) as { publicKey: string };
    sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  }
  await saveSub(sub);
  return 'on';
}

export async function turnOffPush() {
  const r = await registerSW();
  const sub = await r?.pushManager.getSubscription();
  if (!sub) return;
  const uid = auth.currentUser?.uid;
  if (uid) await deleteDoc(doc(db, 'users', uid, 'push', await subId(sub.endpoint))).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Keeps the saved subscription fresh (phones rotate them) and clears the app badge. */
export async function refreshPush() {
  try {
    (navigator as unknown as { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {});
    if (Notification?.permission !== 'granted') return;
    const r = await registerSW();
    const sub = await r?.pushManager.getSubscription();
    if (sub) await saveSub(sub);
  } catch {
    /* ignore */
  }
}

export async function sendTestPush() {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/pushTest', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { sent: number };
}
