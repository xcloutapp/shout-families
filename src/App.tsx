import { useEffect } from 'react';
import { registerSW, refreshPush } from './push';
import { watchForUpdates } from './update';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider, joinGroup, switchGroup, useSession } from './store';
import CardScreen from './screens/CardScreen';
import { LogShout } from './screens/Create';
import { ChatList, NewChat } from './screens/Chats';
import Thread from './screens/Thread';
import GuestRun from './screens/Guest';
import { Balances, Me } from './screens/Tabs';
import Calendar from './screens/Calendar';
import { GroupSetup, Loading, Profile, SignIn, rememberJoin } from './screens/Setup';
import { TabBar } from './ui';
import { Ordering, OrderingBar } from './screens/Ordering';

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

registerSW();
watchForUpdates();

function Gate() {
  const { phase, userDoc } = useSession();

  // Notifications: keep this phone's subscription fresh, clear the badge when opened,
  // and open the right group when a notification for another group is tapped (#/chat/x?g=<group>).
  useEffect(() => {
    if (phase !== 'ready') return;
    const check = () => {
      const g = new URLSearchParams(location.hash.split('?')[1] ?? '').get('g');
      if (g && userDoc?.activeGroupId !== g && userDoc?.groupIds?.includes(g)) switchGroup(g).catch(() => {});
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open' && typeof e.data.url === 'string') {
        location.href = e.data.url;
        check();
      }
    };
    const onVis = () => document.visibilityState === 'visible' && refreshPush();
    check();
    refreshPush();
    window.addEventListener('hashchange', check);
    document.addEventListener('visibilitychange', onVis);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('hashchange', check);
      document.removeEventListener('visibilitychange', onVis);
      navigator.serviceWorker?.removeEventListener('message', onMsg);
    };
  }, [phase, userDoc?.activeGroupId, userDoc?.groupIds]);

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
    <>
    <OrderingBar />
    <Routes>
      <Route path="/" element={<ChatList />} />
      <Route path="/chat/:cid" element={<Thread />} />
      <Route path="/new-chat" element={<NewChat />} />
      <Route path="/new/shout" element={<LogShout />} />
      <Route path="/card/:id" element={<CardScreen />} />
      <Route path="/order/:id" element={<Ordering />} />
      <Route path="/balances" element={<Balances />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/me" element={<Me />} />
      <Route path="*" element={<ChatList />} />
    </Routes>
    <TabBar />
    </>
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
