import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth } from '../firebase';
import { COLORS, createGroup, joinGroup, logOut, saveProfile, useSession } from '../store';
import type { GroupType } from '../types';
import { Icon } from '../ui';

const PENDING = 'shout-pending-join';

export function rememberJoin(groupId: string) {
  try {
    localStorage.setItem(PENDING, groupId);
  } catch {
    /* ignore */
  }
}
function takePendingJoin(): string | null {
  try {
    const g = localStorage.getItem(PENDING);
    localStorage.removeItem(PENDING);
    return g;
  } catch {
    return null;
  }
}

function Logo() {
  return (
    <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="bag" size={38} stroke={2.4} />
    </div>
  );
}

export function SignIn() {
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setErr('Sign-in didn’t work. Check Google sign-in is turned on in Firebase, then try again.');
        console.error(e);
      }
    }
  };
  return (
    <div className="screen" style={{ justifyContent: 'center', gap: 24 }}>
      <Logo />
      <div className="col" style={{ gap: 8 }}>
        <h1 style={{ fontSize: 40, lineHeight: 1.05 }}>Shout</h1>
        <span style={{ fontSize: 17, color: 'var(--text-2)' }}>Dinner runs, jobs, lifts and who owes who, without the group chat chaos.</span>
      </div>
      <button className="btn big light" onClick={go}>Continue with Google</button>
      {err && <span style={{ color: 'var(--yellow)', fontSize: 14 }}>{err}</span>}
    </div>
  );
}

export function Profile({ editing, onDone }: { editing?: boolean; onDone?: () => void }) {
  const { user, userDoc } = useSession();
  const [name, setName] = useState(userDoc?.name ?? user?.displayName?.split(' ')[0] ?? '');
  const [adult, setAdult] = useState<boolean | null>(userDoc ? userDoc.adult : null);
  const [color, setColor] = useState(userDoc?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await saveProfile(name.trim(), adult!, color);
    setBusy(false);
    onDone?.();
  };
  return (
    <div className="screen">
      <h1 style={{ fontSize: 30 }}>{editing ? 'Your profile' : 'Welcome!'}</h1>
      <label className="col">
        <b>What does your family call you?</b>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Steve, Mum, Pa" />
      </label>
      <div className="col">
        <b>Your colour</b>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {COLORS.map((c) => (
            <button key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} style={{ width: 44, height: 44, borderRadius: 22, background: c, border: color === c ? '3px solid var(--text)' : '3px solid transparent' }} />
          ))}
        </div>
      </div>
      <div className="col">
        <b>Are you 18 or over?</b>
        <div className="row">
          <button className={`pill grow ${adult === true ? 'on' : ''}`} style={{ minHeight: 48 }} onClick={() => setAdult(true)}>Yes</button>
          <button className={`pill grow ${adult === false ? 'on' : ''}`} style={{ minHeight: 48 }} onClick={() => setAdult(false)}>No</button>
        </div>
        <span className="muted">Under-18s don't see bottle shop runs and only have balances, not payments.</span>
      </div>
      <div className="grow" />
      <button className="btn big primary" disabled={!name.trim() || adult === null || busy} onClick={save}>{editing ? 'Save' : 'Next'}</button>
      {!editing && <button className="btn quiet" onClick={logOut}>Use a different account</button>}
    </div>
  );
}

export function GroupSetup() {
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupType>('family');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const pending = takePendingJoin();
    if (pending) {
      setBusy(true);
      joinGroup(pending)
        .then((r) => r === 'missing' && setMsg('That invite link didn’t work. Ask for a new one.'))
        .catch(() => setMsg('That invite link didn’t work. Ask for a new one.'))
        .finally(() => setBusy(false));
    }
  }, []);

  const join = async () => {
    const id = code.trim().split('/').pop() ?? '';
    setBusy(true);
    setMsg('');
    try {
      const r = await joinGroup(id);
      if (r === 'missing') setMsg('Couldn’t find that group.');
    } catch {
      setMsg('Couldn’t find that group.');
    }
    setBusy(false);
  };

  return (
    <div className="screen">
      <h1 style={{ fontSize: 30 }}>Start your group</h1>
      <div className="row">
        {(['family', 'house', 'mates'] as GroupType[]).map((t) => (
          <button key={t} className={`pill grow ${type === t ? 'on' : ''}`} style={{ minHeight: 48 }} onClick={() => setType(t)}>
            {t === 'family' ? 'Family' : t === 'house' ? 'House' : 'Mates'}
          </button>
        ))}
      </div>
      <input className="input" placeholder={type === 'family' ? 'e.g. Team Clout' : type === 'house' ? 'e.g. 12 Smith St' : 'e.g. Saturday crew'} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn big primary" disabled={!name.trim() || busy} onClick={async () => { setBusy(true); await createGroup(name.trim(), type); }}>Create group</button>

      <div className="row muted" style={{ justifyContent: 'center' }}>or</div>

      <b>Got an invite?</b>
      <input className="input" placeholder="Paste the invite link" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="btn big ghost" disabled={!code.trim() || busy} onClick={join}>Join</button>
      {msg && <span style={{ color: 'var(--yellow)', fontSize: 14 }}>{msg}</span>}
      <div className="grow" />
      <button className="btn quiet" onClick={logOut}>Sign out</button>
    </div>
  );
}

export function Loading() {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Logo />
    </div>
  );
}
