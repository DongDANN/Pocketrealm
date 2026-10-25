import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { C } from '../../art/palette';
import { isOnboarded } from '../../data/onboard';
import { runOpenJobs } from '../../data/openJobs';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { say } from '../lib/toast';
import { useSession } from './session';

export function LoadingPanel({ label = 'Opening the book' }: { label?: string }) {
  return (
    <main className="shell app-shell">
      <PixelPanel className="loading-panel" role="status">
        <PixelText text={label} color={C.paper1} pixelScale={3} wrap={22} />
        <PixelText
          text="Everything stays on this device."
          color={C.paper3}
          pixelScale={2}
          wrap={30}
        />
      </PixelPanel>
    </main>
  );
}

export function FatalPanel({ message }: { message: string }) {
  return (
    <main className="shell app-shell">
      <PixelPanel className="fatal-panel" role="alert">
        <h1 className="panel-title">
          <PixelText text="The book is unavailable" color={C.paper0} pixelScale={3} wrap={22} />
        </h1>
        <p>
          <PixelText
            text={`${message} Nothing was changed. Private browsing or a full device can block local storage.`}
            color={C.paper2}
            pixelScale={2}
            wrap={32}
          />
        </p>
        <PixelButton onClick={() => window.location.reload()}>
          <PixelText text="Try again" color={C.ink900} pixelScale={2} />
        </PixelButton>
      </PixelPanel>
    </main>
  );
}

export function useOnboarded(): boolean | undefined {
  const { db } = useSession();
  return useLiveQuery(() => isOnboarded(db), [db]);
}

export function RequireOnboarded({ children }: { children: ReactNode }) {
  const onboarded = useOnboarded();
  if (onboarded === undefined) return <LoadingPanel />;
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const onboarded = useOnboarded();
  if (onboarded === undefined) return <LoadingPanel />;
  if (onboarded) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Opens the database, then runs the once-on-open jobs before any screen paints a number. A fresh
 * install skips the jobs until onboarding has created a companion, then runs them once. The jobs are
 * idempotent, so React's development double-mount cannot double-pay them.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { db, ctx } = useSession();
  const onboarded = useOnboarded();
  const [opened, setOpened] = useState(false);
  const [jobsDone, setJobsDone] = useState(false);
  const [problem, setProblem] = useState('');
  const started = useRef(false);

  useEffect(() => {
    let alive = true;
    void db
      .open()
      .then(() => {
        if (alive) setOpened(true);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setProblem(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [db]);

  useEffect(() => {
    if (!opened || onboarded === undefined) return;
    if (!onboarded) return;
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const report = await runOpenJobs(db, ctx, { usedOffline: !navigator.onLine });
        if (report.oil.granted) say('Daily oil +20', 'reward');
        for (const achievement of report.achievements) {
          say(`Achievement: ${achievement.name} · +${achievement.xp} XP`, 'reward');
        }
        setJobsDone(true);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [opened, onboarded, db, ctx]);

  if (problem) return <FatalPanel message={problem} />;
  if (!opened) return <LoadingPanel />;
  if (onboarded && !jobsDone) return <LoadingPanel />;
  return <>{children}</>;
}
