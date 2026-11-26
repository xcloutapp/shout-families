import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider, joinGroup, useSession } from './store';
import Home from './screens/Home';
import CardScreen from './screens/CardScreen';
import { LogShout, NewSheet, StartDinner, StartJob, StartRun } from './screens/Create';
import { Balances, Calendar, Me } from './screens/Tabs';
import { GroupSetup, Loading, Profile, SignIn, rememberJoin } from './screens/Setup';

// Catch invite links (#/join/<groupId>) before anything else renders.
const m = location.hash.match(/^#\/join\/([A-Za-z0-9]+)/);
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
      <Route path="/" element={<Home />} />
      <Route path="/new" element={<><Home /><NewSheet /></>} />
      <Route path="/new/run" element={<StartRun />} />
      <Route path="/new/dinner" element={<StartDinner />} />
      <Route path="/new/job" element={<StartJob />} />
      <Route path="/new/shout" element={<LogShout />} />
      <Route path="/card/:id" element={<CardScreen />} />
      <Route path="/balances" element={<Balances />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/me" element={<Me />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <div className="app">
          <Gate />
        </div>
      </HashRouter>
    </SessionProvider>
  );
}
