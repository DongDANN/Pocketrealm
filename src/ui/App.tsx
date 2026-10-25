import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { C } from '../art/palette';
import { useOnline } from './hooks/useOnline';
import { subscribePwa, type PwaState } from '../pwa/register';
import { PixelText } from './components/PixelText';
import { ToastHost } from './components/ToastHost';
import { AppGate, OnboardingGate, RequireOnboarded } from './app/gates';
import { SessionProvider } from './app/session';
import { AppShell } from './app/AppShell';
import { Foundation } from './screens/Foundation';
import { ArtPreview } from './screens/ArtPreview';
import { TodayMock } from './screens/TodayMock';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Add } from './screens/Add';
import { Envelopes } from './screens/Envelopes';
import { EnvelopeDetail } from './screens/EnvelopeDetail';
import { Goals } from './screens/Goals';
import { History } from './screens/History';
import { Settings } from './screens/Settings';

/**
 * First run leads to onboarding; every book screen sits behind the shared thumb bar. The style-lock
 * screens stay reachable at their own addresses so the art and layout checks keep watching them.
 */
export function App() {
  const online = useOnline();
  const [pwa, setPwa] = useState<PwaState>({ offlineReady: false, needRefresh: false });

  useEffect(() => subscribePwa(setPwa), []);

  return (
    <SessionProvider>
      <AppGate>
        <Routes>
          <Route
            path="/onboarding"
            element={
              <OnboardingGate>
                <Onboarding />
              </OnboardingGate>
            }
          />
          <Route
            element={
              <RequireOnboarded>
                <AppShell />
              </RequireOnboarded>
            }
          >
            <Route path="/" element={<Today />} />
            <Route path="/add" element={<Add />} />
            <Route path="/envelopes" element={<Envelopes />} />
            <Route path="/envelopes/:id" element={<EnvelopeDetail />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/art" element={<ArtPreview />} />
          <Route path="/mock/today" element={<TodayMock />} />
          <Route path="/mock/foundation" element={<Foundation needRefresh={pwa.needRefresh} />} />
          <Route path="/today" element={<Navigate to="/mock/today" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastHost />
        {!online && (
          <p className="offline-strip" role="status">
            <PixelText
              text="Working offline. Everything is saved on this device."
              color={C.paper1}
              pixelScale={2}
              wrap={30}
              align="center"
            />
          </p>
        )}
      </AppGate>
    </SessionProvider>
  );
}
