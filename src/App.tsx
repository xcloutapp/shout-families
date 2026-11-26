import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider, joinGroup, useSession } from './store';
import CardScreen from './screens/CardScreen';
import { LogShout } from './screens/Create';
import { ChatList, NewChat } from './screens/Chats';
import Thread from './screens/Thread';
import GuestRun from './screens/Guest';
import { Balances, Calendar, Me } from './screens/Tabs';
import { GroupSetup, Loading, Profile, SignIn, rememberJoin } from './screens/Setup';

// Shared into Shout from another app's share sheet (Android): ?url=…&text=…
{
  const q = new URLSearchParams(location.search);
  const shared = q.get('url') || q.get('text');
  if (shared) {
    try {
      sessionStorage.setItem('shout-shared', (q.get('url') ? q.get('url')! : shared).trim());
    } catch {
      /* ignore */
    }
    history.replaceState(null, '', `${location.pathname}#/chat/fun`);
  }
}

// Catch invite links (#/join/<groupId>) before anything else renders.
const m = location.hash.match(/^#\/join\/([A-Za-z0-9]+(?:\/[A-Za-z0-9]+)?)/);
if (m) {
  rememberJoin(m[1]);
  history.replaceState(null, '', `${location.pathname}#/`);
}

function Gate() {
  const { phase } = useSession();

  // Already in a group and opened an invite to another one: join it.
  useEffect(() => {
    if (phase !== 'ready') return;
    try {
      const g = localStorage.getItem('shout-pending-join');
      if (g) {
        localStorage.removeItem('shout-pending-join');
        joinGroup(g).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [phase]);

  if (phase === 'loading') return <Loading />;
  if (phase === 'signedOut') return <SignIn />;
  if (phase === 'profile') return <Profile />;
  if (phase === 'group') return <GroupSetup />;
  return (
    <Routes>
      <Route path="/" element={<ChatList />} />
      <Route path="/chat/:cid" element={<Thread />} />
      <Route path="/new-chat" element={<NewChat />} />
      <Route path="/new/shout" element={<LogShout />} />
      <Route path="/card/:id" element={<CardScreen />} />
      <Route path="/balances" element={<Balances />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/me" element={<Me />} />
      <Route path="*" element={<ChatList />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <div className="app">
          <Routes>
            <Route path="/r/:token" element={<GuestRun />} />
            <Route path="*" element={<Gate />} />
          </Routes>
        </div>
      </HashRouter>
    </SessionProvider>
  );
}
