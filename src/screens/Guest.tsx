import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { timeLeft } from '../store';
import type { Share } from '../types';
import { Icon } from '../ui';

/** What someone without the app sees when they tap a run link in iMessage or WhatsApp. No sign-in. */
export default function GuestRun() {
  const { token = '' } = useParams();
  const [share, setShare] = useState<Share | null | undefined>(undefined);
  const [name, setName] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<'order' | 'none' | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => onSnapshot(doc(db, 'shares', token), (d) => setShare(d.exists() ? (d.data() as Share) : null), () => setShare(null)), [token]);

  if (share === undefined) return <div className="screen" />;
  if (share === null) {
    return (
      <div className="screen" style={{ justifyContent: 'center' }}>
        <h1 style={{ fontSize: 28 }}>This link has expired</h1>
        <span className="muted">Ask whoever sent it for a new one.</span>
      </div>
    );
  }

  const who = name === 'other' ? other.trim() : name;
  const submit = async () => {
    setErr('');
    try {
      await addDoc(collection(db, 'shares', token, 'guestOrders'), { name: who, text: text.trim(), at: Date.now() });
      setSent('order');
    } catch {
      setErr('That didn’t go through. The run may have closed.');
    }
  };

  return (
    <div className="screen">
      <div className="row">
        <span style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="bag" size={20} stroke={2.4} /></span>
        <span className="muted">Shout · opened from your group chat</span>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>{share.buyerName}'s going to {share.shops.join(' + ')}</h1>
        <span style={{ color: 'var(--text-2)' }}>{share.open ? (share.closesAt ? `Orders close in ${timeLeft(share.closesAt)}` : 'Taking orders now') : 'Orders have closed'}</span>
      </div>
      {share.orders.length > 0 && (
        <div className="card">
          <div className="label">So far</div>
          {share.orders.map((o, i) => (
            <span key={i} style={{ fontSize: 14 }}><b>{o.name}</b> <span style={{ color: 'var(--text-2)' }}>{o.text}</span></span>
          ))}
        </div>
      )}

      {sent ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 24 }}>
          <b style={{ fontSize: 18 }}>{sent === 'order' ? `Done. ${share.buyerName} has your order.` : 'No worries.'}</b>
          <span className="muted">Get Shout to save your usual, see who owes who, and get a heads-up next time.</span>
          <a className="btn primary" href={`${location.origin}${location.pathname}#/`} style={{ textDecoration: 'none', marginTop: 8 }}>Get Shout</a>
        </div>
      ) : share.open ? (
        <>
          <div className="col">
            <b>Who are you?</b>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {share.names.filter((n) => n !== share.buyerName).map((n) => (
                <button key={n} className={`pill ${name === n ? 'on' : ''}`} onClick={() => setName(n)}>{n}</button>
              ))}
              <button className={`pill ${name === 'other' ? 'on' : ''}`} onClick={() => setName('other')}>Someone else</button>
            </div>
            {name === 'other' && <input className="input" placeholder="Your name" value={other} onChange={(e) => setOther(e.target.value)} />}
          </div>
          <label className="col">
            <b>What do you want?</b>
            <input className="input" placeholder="e.g. Burrito bowl, no pico" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {err && <span style={{ color: 'var(--yellow)' }}>{err}</span>}
          <div className="grow" />
          <button className="btn big primary" disabled={!who || !text.trim()} onClick={submit}>Add my order</button>
          <button className="btn quiet" onClick={() => setSent('none')}>Nothing for me this time</button>
        </>
      ) : null}
    </div>
  );
}
