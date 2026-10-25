import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { C } from '../../art/palette';
import { CURRENCIES, DEFAULT_CURRENCY, isCurrencyCode } from '../../core/currency';
import type { Settings as SettingsValue } from '../../core/types';
import { dateOf, daysBetween } from '../../core/dates';
import {
  exportDatabase,
  importDatabase,
  inspectImport,
  type ImportPreview,
} from '../../data/exportImport';
import { latestBackup, recordBackup } from '../../data/backups';
import { saveSettings } from '../../data/repos';
import { wipeBook } from '../../data/wipe';
import { reloadForUpdate, subscribePwa, type PwaState } from '../../pwa/register';
import { APP_VERSION } from '../../version';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useAllTransactions, useSettings, useToday } from '../app/hooks';
import { useSession } from '../app/session';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { bytesLabel } from '../../core/view';
import { say } from '../lib/toast';
import { setTextMode, useTextMode } from '../lib/textMode';

const LOCALES = ['en-PH', 'en-US', 'en-GB', 'en-SG', 'en-IN', 'de-DE', 'fr-FR'];
const BACKUP_REMINDER_DAYS = 7;

function downloadJson(text: string, filename: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const { db, ctx } = useSession();
  const settings = useSettings();
  const today = useToday();
  const transactions = useAllTransactions();
  const backup = useLiveQuery(() => latestBackup(db), [db]);
  const textMode = useTextMode();
  const install = useInstallPrompt();

  const [pwa, setPwa] = useState<PwaState>({ offlineReady: false, needRefresh: false });
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [importText, setImportText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importProblems, setImportProblems] = useState<{ path: string; message: string }[]>([]);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [replaceChecked, setReplaceChecked] = useState(false);
  const [importResult, setImportResult] = useState('');

  const [wipeWord, setWipeWord] = useState('');

  useEffect(() => subscribePwa(setPwa), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (navigator.storage?.persisted) {
          const value = await navigator.storage.persisted();
          if (alive) setPersisted(value);
        } else if (alive) {
          setPersisted(false);
        }
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          if (alive) setUsage({ usage: estimate.usage, quota: estimate.quota });
        }
      } catch {
        if (alive) setPersisted(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<SettingsValue>, message: string) => {
      if (!settings) return;
      try {
        const next = { ...settings, ...patch };
        await saveSettings(db, next);
        say(message, 'neutral');
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      }
    },
    [db, settings],
  );

  const exportBook = useCallback(
    async (reason: 'manual' | 'reminder') => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        const now = ctx.clock.now();
        const text = await exportDatabase(db, { now, appVersion: APP_VERSION });
        downloadJson(text, `pocketrealm-${today}.json`);
        await recordBackup(db, text, { reason, now });
        say('A full backup file is in your downloads.', 'reward');
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      } finally {
        setBusy(false);
      }
    },
    [busy, ctx, db, today],
  );

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setImportResult('');
    setImportProblems([]);
    setPreview(null);
    setImportText(null);
    setReplaceChecked(false);
    setMode('merge');
    try {
      const text = await file.text();
      const inspected = inspectImport(text);
      if (!inspected.ok) {
        setImportProblems(inspected.problems);
        return;
      }
      setImportText(text);
      setPreview(inspected.preview);
    } catch (problem) {
      setImportProblems([
        { path: 'file', message: problem instanceof Error ? problem.message : String(problem) },
      ]);
    }
  };

  const runImport = async () => {
    if (!importText || busy || (mode === 'replace' && !replaceChecked)) return;
    setBusy(true);
    setError('');
    setImportProblems([]);
    try {
      const outcome = await importDatabase(db, importText, {
        mode,
        now: ctx.clock.now(),
        appVersion: APP_VERSION,
      });
      if (!outcome.ok) {
        setImportProblems(outcome.problems);
        return;
      }
      setImportResult(
        `Wrote ${outcome.rowsWritten} rows and skipped ${outcome.rowsSkipped} already present. A backup of the old book was kept inside this device.`,
      );
      setPreview(null);
      setImportText(null);
      say('Import finished.', 'reward');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  if (!settings || !transactions) return <LoadingPanel label="Opening settings" />;

  const coin = isCurrencyCode(settings.currency) ? settings.currency : DEFAULT_CURRENCY;
  const backupAge = backup ? daysBetween(dateOf(backup.at), today) : null;
  const needsBackup =
    transactions.length >= 5 && (backupAge === null || backupAge >= BACKUP_REMINDER_DAYS);
  const lastBackupCopy =
    backup === undefined
      ? 'No backup has been made yet.'
      : `Last backup ${dateOf(backup.at)}${backupAge !== null && backupAge > 0 ? ` (${backupAge} days ago)` : ' (today)'}.`;
  const localeOptions = LOCALES.includes(settings.locale) ? LOCALES : [settings.locale, ...LOCALES];

  return (
    <main className="shell app-shell">
      <AppHeader title="Settings" backTo="/" settings={false} />

      {error !== '' && (
        <PixelPanel className="problem-panel" role="alert">
          <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
        </PixelPanel>
      )}

      {needsBackup && (
        <PixelPanel className="remind-panel" aria-labelledby="backup-remind-title">
          <h2 id="backup-remind-title" className="panel-title">
            <PixelText text="A backup would be kind" color={C.paper0} pixelScale={3} wrap={24} />
          </h2>
          <p>
            <PixelText text={lastBackupCopy} color={C.paper3} pixelScale={2} wrap={40} />
          </p>
          <PixelButton disabled={busy} onClick={() => void exportBook('reminder')}>
            <PixelText text="Export a backup now" color={C.ink900} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}

      <PixelPanel className="settings-panel" aria-labelledby="money-settings-title">
        <h2 id="money-settings-title" className="panel-title">
          <PixelText text="Money" color={C.paper0} pixelScale={3} />
        </h2>
        <label className="field">
          <span className="field-label">
            <PixelText text="Currency (display only)" color={C.paper3} pixelScale={2} />
          </span>
          <select
            className="currency-select wide-select"
            aria-label="Currency"
            value={coin}
            onChange={(event) => {
              const next = event.target.value;
              if (isCurrencyCode(next))
                void update(
                  { currency: next },
                  `Currency is now ${next}. Amounts are not converted.`,
                );
            }}
          >
            {CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} {option.symbol}
              </option>
            ))}
          </select>
          <span className="field-note">
            <PixelText
              text="Changing the coin only changes how amounts are written. Every stored number stays exactly as it was."
              color={C.paper3}
              pixelScale={2}
              wrap={40}
            />
          </span>
        </label>
        <label className="field">
          <span className="field-label">
            <PixelText text="Language and dates" color={C.paper3} pixelScale={2} />
          </span>
          <select
            className="currency-select wide-select"
            aria-label="Locale"
            value={settings.locale}
            onChange={(event) =>
              void update({ locale: event.target.value }, 'Date language saved.')
            }
          >
            {localeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            <PixelText text="Budget period starts on day" color={C.paper3} pixelScale={2} />
          </span>
          <select
            className="currency-select wide-select"
            aria-label="Period start day"
            value={settings.periodStartDay}
            onChange={(event) =>
              void update(
                { periodStartDay: Number(event.target.value) },
                'Period start saved. The current period keeps its numbers.',
              )
            }
          >
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
      </PixelPanel>

      <PixelPanel className="settings-panel" aria-labelledby="appearance-title">
        <h2 id="appearance-title" className="panel-title">
          <PixelText text="Appearance and sound" color={C.paper0} pixelScale={3} wrap={24} />
        </h2>
        <div className="toggle-row">
          <PixelButton
            variant="secondary"
            aria-pressed={textMode === 'system'}
            onClick={() => {
              const next = textMode === 'system' ? 'pixel' : 'system';
              setTextMode(next);
              say(next === 'system' ? 'Readable text on.' : 'Bitmap text on.', 'neutral');
            }}
          >
            <PixelText
              text={textMode === 'system' ? 'Readable text: on' : 'Readable text: bitmap'}
              color={C.paper0}
              pixelScale={2}
            />
          </PixelButton>
        </div>
        <label className="field">
          <span className="field-label">
            <PixelText text="Motion" color={C.paper3} pixelScale={2} />
          </span>
          <select
            className="currency-select wide-select"
            aria-label="Motion"
            value={settings.reducedMotion}
            onChange={(event) =>
              void update(
                { reducedMotion: event.target.value as SettingsValue['reducedMotion'] },
                'Motion preference saved.',
              )
            }
          >
            <option value="system">Follow the device</option>
            <option value="on">Reduce motion</option>
            <option value="off">Allow motion</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            <PixelText text="Theme" color={C.paper3} pixelScale={2} />
          </span>
          <div className="static-value">
            <PixelText text="Realm night" color={C.paper1} pixelScale={2} />
          </div>
          <span className="field-note">
            <PixelText
              text="A daylight theme is planned after the MVP; the realm is drawn for night."
              color={C.paper3}
              pixelScale={2}
              wrap={40}
            />
          </span>
        </label>
        <div className="toggle-row">
          <button
            type="button"
            className={settings.sound ? 'toggle-button on' : 'toggle-button'}
            aria-pressed={settings.sound}
            onClick={() =>
              void update({ sound: !settings.sound }, settings.sound ? 'Sound off.' : 'Sound on.')
            }
          >
            <img className="ui-icon" src="/ui/ui-icon-music.png" width={20} height={20} alt="" />
            <PixelText
              text={settings.sound ? 'Sound on' : 'Sound off'}
              color={C.paper1}
              pixelScale={2}
            />
          </button>
        </div>
        <p className="field-note">
          <PixelText
            text={`Rest tokens: ${settings.restTokensPerMonth} a month. A rest day keeps the streak alive without logging; nothing is lost.`}
            color={C.paper3}
            pixelScale={2}
            wrap={44}
          />
        </p>
      </PixelPanel>

      <PixelPanel className="settings-panel" aria-labelledby="storage-title">
        <h2 id="storage-title" className="panel-title">
          <PixelText text="Storage on this device" color={C.paper0} pixelScale={3} wrap={24} />
        </h2>
        <p>
          <PixelText
            text={
              persisted === null
                ? 'The browser has not answered yet. Everything is still saved locally.'
                : persisted
                  ? 'The browser marked this book as persistent, so it should not be cleared to make room.'
                  : 'The browser may clear this book if the device runs very low on space. A backup is the strong guarantee.'
            }
            color={C.paper3}
            pixelScale={2}
            wrap={44}
          />
        </p>
        {usage && (
          <p>
            <PixelText
              text={`Using ${bytesLabel(usage.usage ?? 0)}${usage.quota ? ` of about ${bytesLabel(usage.quota)} available` : ''}.`}
              color={C.paper3}
              pixelScale={2}
              wrap={40}
            />
          </p>
        )}
        <div className="settings-actions">
          <PixelButton
            variant="secondary"
            onClick={() => {
              void (async () => {
                try {
                  if (!navigator.storage?.persist) {
                    say('This browser has no way to ask for persistent storage.', 'warn');
                    return;
                  }
                  const granted = await navigator.storage.persist();
                  setPersisted(granted);
                  say(
                    granted
                      ? 'Persistent storage granted.'
                      : 'The browser kept its default policy. Export backups to be safe.',
                    granted ? 'reward' : 'warn',
                  );
                } catch (problem) {
                  setError(problem instanceof Error ? problem.message : String(problem));
                }
              })();
            }}
          >
            <PixelText text="Ask for persistent storage" color={C.paper0} pixelScale={2} />
          </PixelButton>
        </div>
      </PixelPanel>

      <PixelPanel className="settings-panel" aria-labelledby="backup-title">
        <h2 id="backup-title" className="panel-title">
          <PixelText text="Backup and restore" color={C.paper0} pixelScale={3} wrap={24} />
        </h2>
        <p>
          <PixelText text={lastBackupCopy} color={C.paper3} pixelScale={2} wrap={40} />
        </p>
        <PixelButton disabled={busy} onClick={() => void exportBook('manual')}>
          <img className="ui-icon" src="/ui/ui-icon-check.png" width={20} height={20} alt="" />
          <PixelText
            text={busy ? 'Packing the book' : 'Export everything'}
            color={C.ink900}
            pixelScale={2}
          />
        </PixelButton>
        <label className="pixel-button secondary link-button wide" htmlFor="import-file">
          <PixelText text="Choose a backup file to import" color={C.paper0} pixelScale={2} />
        </label>
        <input
          id="import-file"
          className="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />

        {importProblems.length > 0 && (
          <div className="problem-line" role="alert">
            <PixelText
              text="That file could not be used."
              color={C.ember1}
              pixelScale={2}
              wrap={40}
            />
            {importProblems.slice(0, 5).map((problem) => (
              <PixelText
                key={`${problem.path}:${problem.message}`}
                text={`${problem.path}: ${problem.message}`}
                color={C.ember1}
                pixelScale={2}
                wrap={44}
              />
            ))}
          </div>
        )}

        {preview && (
          <div className="import-preview" aria-label="Import preview">
            <h3 className="panel-subtitle">
              <PixelText text="This is in the file" color={C.paper0} pixelScale={3} wrap={24} />
            </h3>
            <ul className="plain-list">
              <li>
                <PixelText
                  text={`${preview.counts.transactions ?? 0} entries, ${preview.counts.envelopes ?? 0} envelopes, ${preview.counts.goals ?? 0} goals`}
                  color={C.paper2}
                  pixelScale={2}
                  wrap={42}
                />
              </li>
              <li>
                <PixelText
                  text={`Schema v${preview.schemaVersion} · written by app ${preview.appVersion} · exported ${dateOf(preview.exportedAt)}`}
                  color={C.paper3}
                  pixelScale={2}
                  wrap={42}
                />
              </li>
              {preview.dateRange.from && (
                <li>
                  <PixelText
                    text={`Entries from ${preview.dateRange.from} to ${preview.dateRange.to ?? preview.dateRange.from}`}
                    color={C.paper3}
                    pixelScale={2}
                    wrap={42}
                  />
                </li>
              )}
            </ul>
            <label className="field">
              <span className="field-label">
                <PixelText text="How to bring it in" color={C.paper3} pixelScale={2} />
              </span>
              <select
                className="currency-select wide-select"
                aria-label="Import mode"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as 'merge' | 'replace');
                  setReplaceChecked(false);
                }}
              >
                <option value="merge">Merge: keep what I have</option>
                <option value="replace">Replace: clear this book first</option>
              </select>
            </label>
            {mode === 'replace' && (
              <label className="toggle-row">
                <input
                  type="checkbox"
                  aria-label="Confirm replacing the whole book"
                  checked={replaceChecked}
                  onChange={(event) => setReplaceChecked(event.target.checked)}
                />
                <PixelText
                  text="Replace everything. I understand a backup of my old book is kept but it will not be shown here."
                  color={C.paper3}
                  pixelScale={2}
                  wrap={40}
                />
              </label>
            )}
            <PixelButton
              disabled={busy || (mode === 'replace' && !replaceChecked)}
              onClick={() => void runImport()}
            >
              <PixelText
                text={
                  busy ? 'Importing' : mode === 'replace' ? 'Replace my book' : 'Merge this file'
                }
                color={C.ink900}
                pixelScale={2}
              />
            </PixelButton>
          </div>
        )}

        {importResult !== '' && (
          <div className="import-result" role="status">
            <PixelText text={importResult} color={C.moss1} pixelScale={2} wrap={42} />
            <PixelButton onClick={() => window.location.reload()}>
              <PixelText text="Reload the book" color={C.ink900} pixelScale={2} />
            </PixelButton>
          </div>
        )}
      </PixelPanel>

      <PixelPanel className="settings-panel" aria-labelledby="install-title">
        <h2 id="install-title" className="panel-title">
          <PixelText text="Install" color={C.paper0} pixelScale={3} />
        </h2>
        {install.available ? (
          <PixelButton onClick={() => void install.prompt()}>
            <PixelText text="Install Pocketrealm" color={C.ink900} pixelScale={2} />
          </PixelButton>
        ) : (
          <p>
            <PixelText
              text={
                install.ios
                  ? 'On iPhone or iPad: open Share, then Add to Home Screen. Installing keeps the book safer from storage cleanups.'
                  : 'Use the browser menu and choose Install app (or Add to Home screen). The app works without a store.'
              }
              color={C.paper3}
              pixelScale={2}
              wrap={44}
            />
          </p>
        )}
        <p className="field-note">
          <PixelText
            text="Installed or not, every feature works offline after one visit. There are no notifications and no server."
            color={C.paper3}
            pixelScale={2}
            wrap={44}
          />
        </p>
      </PixelPanel>

      <PixelPanel className="settings-panel" aria-labelledby="about-title">
        <h2 id="about-title" className="panel-title">
          <PixelText text="About" color={C.paper0} pixelScale={3} />
        </h2>
        <ul className="plain-list">
          <li>
            <PixelText text={`Pocketrealm ${APP_VERSION}`} color={C.paper1} pixelScale={2} />
          </li>
          <li>
            <PixelText
              text={
                pwa.needRefresh
                  ? 'An update is ready to install.'
                  : 'This build is the latest one the app can see.'
              }
              color={C.paper3}
              pixelScale={2}
              wrap={40}
            />
          </li>
          <li>
            <PixelText
              text={
                pwa.offlineReady
                  ? 'The app shell is ready for offline use.'
                  : 'Offline use starts after the first full visit.'
              }
              color={C.paper3}
              pixelScale={2}
              wrap={40}
            />
          </li>
        </ul>
        {pwa.needRefresh && (
          <PixelButton onClick={() => void reloadForUpdate()}>
            <PixelText text="Update and reload" color={C.ink900} pixelScale={2} />
          </PixelButton>
        )}
        <p className="field-note">
          <PixelText
            text="Pocketrealm is a budgeting aid, not financial advice. It never connects to a bank and no amount leaves this device."
            color={C.paper3}
            pixelScale={2}
            wrap={44}
          />
        </p>
      </PixelPanel>

      <PixelPanel className="danger-panel" aria-labelledby="danger-title">
        <h2 id="danger-title" className="panel-title">
          <PixelText text="Delete all data" color={C.ember1} pixelScale={3} wrap={24} />
        </h2>
        <p>
          <PixelText
            text="This clears every envelope, entry, goal, companion and reward on this device. It cannot be undone. Export first if there is any doubt."
            color={C.paper3}
            pixelScale={2}
            wrap={44}
          />
        </p>
        <PixelButton variant="secondary" disabled={busy} onClick={() => void exportBook('manual')}>
          <PixelText text="Export before deleting" color={C.paper0} pixelScale={2} />
        </PixelButton>
        <label className="field">
          <span className="field-label">
            <PixelText text="Type DELETE to confirm" color={C.paper3} pixelScale={2} />
          </span>
          <input
            className="text-input"
            aria-label="Type DELETE to confirm"
            autoComplete="off"
            value={wipeWord}
            onChange={(event) => setWipeWord(event.target.value)}
          />
        </label>
        <PixelButton
          className="danger"
          disabled={wipeWord !== 'DELETE'}
          onClick={() => {
            void (async () => {
              try {
                await wipeBook(db);
                window.location.assign('/');
              } catch (problem) {
                setError(problem instanceof Error ? problem.message : String(problem));
              }
            })();
          }}
        >
          <PixelText text="Delete this book for good" color={C.ink900} pixelScale={2} />
        </PixelButton>
      </PixelPanel>

      <p className="art-footer">
        <PixelText
          text={`Stored only on this device · no accounts · no trackers · ${CURRENCIES.length} display coins`}
          color={C.paper3}
          pixelScale={2}
          wrap={44}
          align="center"
        />
      </p>
    </main>
  );
}
