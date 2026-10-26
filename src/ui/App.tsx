import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { C } from '../art/palette';
import { useOnline } from './hooks/useOnline';
import { subscribePwa, type PwaState } from '../pwa/register';
import { PixelText } from './components/PixelText';
import { ToastHost } from './components/ToastHost';
import { AppGate, ErrorBoundary, OnboardingGate, RequireOnboarded } from './app/gates';
import { DelveProvider } from './app/delve';
import { SessionProvider } from './app/session';
import { AppShell } from './app/AppShell';
import { Foundation } from './screens/Foundation';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Add } from './screens/Add';
import { Envelopes } from './screens/Envelopes';
import { EnvelopeDetail } from './screens/EnvelopeDetail';
import { Goals } from './screens/Goals';
import { History } from './screens/History';
import { Settings } from './screens/Settings';

// The budgeting screens are what a player opens to spend money, so they stay in the first chunk.
// Everything game-shaped loads on demand: the Delve engine, the codex tables and the art preview
// are large, and none of them are needed to log an expense.
const Quests = lazy(() => import('./screens/Quests').then((m) => ({ default: m.Quests })));
const Achievements = lazy(() =>
  import('./screens/Achievements').then((m) => ({ default: m.Achievements })),
);
const Review = lazy(() => import('./screens/Review').then((m) => ({ default: m.Review })));
const Insights = lazy(() => import('./screens/Insights').then((m) => ({ default: m.Insights })));
const Realm = lazy(() => import('./screens/Realm').then((m) => ({ default: m.Realm })));
const Delve = lazy(() => import('./screens/Delve').then((m) => ({ default: m.Delve })));
const DelveCards = lazy(() =>
  import('./screens/DelveCards').then((m) => ({ default: m.DelveCards })),
);
const DelveCodex = lazy(() =>
  import('./screens/DelveCodex').then((m) => ({ default: m.DelveCodex })),
);
const DelveForge = lazy(() =>
  import('./screens/DelveForge').then((m) => ({ default: m.DelveForge })),
);
const DelveHistory = lazy(() =>
  import('./screens/DelveHistory').then((m) => ({ default: m.DelveHistory })),
);
const DelvePolicy = lazy(() =>
  import('./screens/DelvePolicy').then((m) => ({ default: m.DelvePolicy })),
);
const DelveWorkshop = lazy(() =>
  import('./screens/DelveWorkshop').then((m) => ({ default: m.DelveWorkshop })),
);
const ArtPreview = lazy(() =>
  import('./screens/ArtPreview').then((m) => ({ default: m.ArtPreview })),
);
const TodayMock = lazy(() => import('./screens/TodayMock').then((m) => ({ default: m.TodayMock })));

/** A chunk is a request, not a wait: the shell and the thumb bar are already painted behind it. */
function RouteFallback() {
  return (
    <main className="shell app-shell">
      <p className="route-loading" role="status">
        <PixelText text="Opening the next room…" color={C.paper1} pixelScale={2} align="center" />
      </p>
    </main>
  );
}

/**
 * First run leads to onboarding; every book screen sits behind the shared thumb bar. The style-lock
 * screens stay reachable at their own addresses so the art and layout checks keep watching them.
 */
export function App() {
  const online = useOnline();
  const { pathname } = useLocation();
  const [pwa, setPwa] = useState<PwaState>({
    offlineReady: false,
    needRefresh: false,
    preparing: false,
    packReady: false,
  });

  useEffect(() => subscribePwa(setPwa), []);

  return (
    <SessionProvider>
      <ErrorBoundary>
        <AppGate>
          <Suspense fallback={<RouteFallback />}>
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
                    <DelveProvider>
                      <AppShell />
                    </DelveProvider>
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
                <Route path="/quests" element={<Quests />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/review" element={<Review />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/realm" element={<Realm />} />
                <Route path="/delve" element={<Delve />} />
                <Route path="/delve/policy" element={<DelvePolicy />} />
                <Route path="/delve/forge" element={<DelveForge />} />
                <Route path="/delve/workshop" element={<DelveWorkshop />} />
                <Route path="/delve/cards" element={<DelveCards />} />
                <Route path="/delve/codex" element={<DelveCodex />} />
                <Route path="/delve/history" element={<DelveHistory />} />
              </Route>
              <Route path="/art" element={<ArtPreview />} />
              <Route path="/mock/today" element={<TodayMock />} />
              <Route
                path="/mock/foundation"
                element={<Foundation needRefresh={pwa.needRefresh} />}
              />
              <Route path="/today" element={<Navigate to="/mock/today" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <ToastHost />
          {!online ? (
            <p className="offline-strip" role="status">
              <PixelText
                text="Working offline. Everything is saved on this device."
                color={C.paper1}
                pixelScale={2}
                wrap={30}
                align="center"
              />
            </p>
          ) : (
            pwa.preparing &&
            pathname !== '/onboarding' && (
              <p className="offline-strip pack-strip" role="status">
                <PixelText
                  text="Preparing the offline pack. Keep using the book; this only saves a copy for later."
                  color={C.paper1}
                  pixelScale={2}
                  wrap={30}
                  align="center"
                />
                <span className="pack-bar" aria-hidden="true">
                  <span />
                </span>
              </p>
            )
          )}
        </AppGate>
      </ErrorBoundary>
    </SessionProvider>
  );
}
