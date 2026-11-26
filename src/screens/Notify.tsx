import { useEffect, useState } from 'react';
import { pushState, sendTestPush, turnOffPush, turnOnPush, type PushState } from '../push';
import { Sheet, useToast } from '../ui';

const DISMISS = 'shout-push-dismissed';

function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);
  return [state, setState] as const;
}

function InstallSteps() {
  return (
    <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, color: 'var(--text-2)', fontSize: 15 }}>
      <li>Open Shout in <b>Safari</b></li>
      <li>Tap the <b>Share</b> button (square with an arrow)</li>
      <li>Tap <b>Add to Home Screen</b>, then <b>Add</b></li>
      <li>Open Shout from the new icon and turn on notifications</li>
    </ol>
  );
}

/** Small banner at the top of Chats until notifications are on (or dismissed). */
export function NotifyBanner() {
  const [state, setState] = usePushState();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS) === '1';
    } catch {
      return false;
    }
  });
  const [steps, setSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (hidden || (state !== 'off' && state !== 'install')) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const turnOn = async () => {
    if (state === 'install') return setSteps(true);
    setBusy(true);
    try {
      const s = await turnOnPush();
      setState(s);
      if (s === 'on') toast.show('Notifications on');
      else if (s === 'blocked') toast.show('Notifications are blocked in your phone settings');
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="row" style={{ background: '#1c1c22', borderRadius: 14, padding: '10px 12px', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🔔</span>
        <span className="grow" style={{ fontSize: 14, color: 'var(--text-2)' }}>
          {state === 'install' ? 'Add Shout to your Home Screen to get notifications' : 'Get a notification when someone messages you'}
        </span>
        <button className="btn primary" style={{ padding: '6px 12px', fontSize: 14 }} disabled={busy} onClick={turnOn}>
          {state === 'install' ? 'How' : 'Turn on'}
        </button>
        <button className="btn quiet" aria-label="Not now" style={{ padding: '6px 8px', fontSize: 14 }} onClick={dismiss}>✕</button>
      </div>
      {steps && (
        <Sheet onClose={() => setSteps(false)}>
          <h2 style={{ fontSize: 20, margin: 0 }}>Notifications on iPhone</h2>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: 14 }}>iPhones only send notifications to apps on the Home Screen.</p>
          <InstallSteps />
        </Sheet>
      )}
    </>
  );
}

/** Notifications row on the Me tab. */
export function NotifySettings() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      toast.show((e as Error).message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const label: Record<PushState, string> = {
    on: 'On for this phone',
    off: 'Off',
    install: 'Add Shout to your Home Screen first',
    blocked: 'Blocked. Turn them on in Settings › Notifications › Shout',
    unsupported: 'This browser can’t show notifications',
  };

  return (
    <div className="card">
      <div className="label">Notifications</div>
      <div className="between" style={{ gap: 10 }}>
        <span style={{ color: 'var(--text-2)', fontSize: 15 }}>{state ? label[state] : '…'}</span>
        {state === 'off' && (
          <button className="btn primary" disabled={busy} onClick={() => run(async () => {
            const s = await turnOnPush();
            setState(s);
            if (s === 'on') toast.show('Notifications on');
          })}>Turn on</button>
        )}
        {state === 'on' && (
          <button className="btn quiet" disabled={busy} onClick={() => run(async () => {
            await turnOffPush();
            setState('off');
          })}>Turn off</button>
        )}
      </div>
      {state === 'install' && <InstallSteps />}
      {state === 'on' && (
        <button className="btn quiet" disabled={busy} style={{ alignSelf: 'flex-start' }} onClick={() => run(async () => {
          const r = await sendTestPush();
          toast.show(r.sent ? 'Test sent. Lock your phone to see it' : 'No phones found to send to');
        })}>Send me a test</button>
      )}
    </div>
  );
}
