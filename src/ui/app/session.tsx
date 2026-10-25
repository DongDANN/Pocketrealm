import { createContext, useContext, useState, type ReactNode } from 'react';
import { openDatabase, type PocketDb } from '../../data/db';
import type { WriteContext } from '../../data/repos';
import { makeWriteContext } from '../lib/systemContext';
import { C } from '../../art/palette';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';

/**
 * The app's single database handle and write context. Created once per tab (not per render), so a
 * React re-render never opens a second Dexie instance on the same database.
 */

export interface Session {
  db: PocketDb;
  ctx: WriteContext;
}

const SessionContext = createContext<Session | null>(null);

let shared: Session | null = null;

function defaultSession(): Session {
  if (!shared) shared = { db: openDatabase(), ctx: makeWriteContext() };
  return shared;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state] = useState<{ session: Session | null; problem: string }>(() => {
    try {
      return { session: defaultSession(), problem: '' };
    } catch (error) {
      return { session: null, problem: error instanceof Error ? error.message : String(error) };
    }
  });

  if (!state.session) {
    return (
      <main className="shell">
        <PixelPanel className="fatal-panel" role="alert">
          <h1 className="panel-title">
            <PixelText text="The book would not open" color={C.paper0} pixelScale={3} wrap={22} />
          </h1>
          <p>
            <PixelText
              text={`Private browsing and full storage can block the local database. Nothing was changed. ${state.problem}`}
              color={C.paper2}
              pixelScale={2}
              wrap={32}
            />
          </p>
          <button type="button" className="pixel-button" onClick={() => window.location.reload()}>
            <PixelText text="Try again" color={C.ink900} pixelScale={2} />
          </button>
        </PixelPanel>
      </main>
    );
  }

  return <SessionContext.Provider value={state.session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession used outside SessionProvider');
  return session;
}
