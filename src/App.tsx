import { HashRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store';
import Home from './screens/Home';
import CardScreen from './screens/CardScreen';
import { LogShout, NewSheet, StartDinner, StartJob, StartRun } from './screens/Create';
import { Balances, Calendar, Me } from './screens/Tabs';

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <div className="app">
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
          </Routes>
        </div>
      </HashRouter>
    </StoreProvider>
  );
}
