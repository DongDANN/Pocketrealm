import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildWarden } from '../../art/companion';
import { C } from '../../art/palette';
import { disableSound, enableSound, isSoundOn, playSfx } from '../lib/sound';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  currencySymbol,
  formatMoney,
  isCurrencyCode,
  type CurrencyCode,
} from '../../core/currency';
import { useMediaQuery, usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { setTextMode, useTextMode } from '../lib/textMode';
import { AnimatedPixmap } from '../components/AnimatedPixmap';
import { Gauge } from '../components/Gauge';
import { NumberPad, type NumberPadKey } from '../components/NumberPad';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { RoomStage } from '../components/RoomStage';

const SAFE_MINOR = 425000;
const WEEK_MINOR = 950000;

const ENVELOPES = [
  { name: 'Groceries', spent: 1184000, limit: 2400000, tone: 'moss' as const },
  { name: 'Transport', spent: 320000, limit: 800000, tone: 'amber' as const },
  { name: 'Treats', spent: 410000, limit: 500000, tone: 'rose' as const },
];

const DATE_LABEL = 'SUN · 25 OCT';
const CURRENCY_STORAGE_KEY = 'pocketrealm.currency';

type IconName = 'oil' | 'spark' | 'coin' | 'plus' | 'check' | 'music';

function UiIcon({ name, size = 22, alt = '' }: { name: IconName; size?: number; alt?: string }) {
  return (
    <img className="ui-icon" src={`/ui/ui-icon-${name}.png`} width={size} height={size} alt={alt} />
  );
}

function storedCurrency(): CurrencyCode {
  try {
    const value = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isCurrencyCode(value) ? value : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function TodayMock() {
  const reducedMotion = usePrefersReducedMotion();
  const textMode = useTextMode();
  const wide = useMediaQuery('(min-width: 760px)');
  const warden = useMemo(() => buildWarden(), []);

  const [amount, setAmount] = useState('');
  const [padOpen, setPadOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundOn());
  const [checkedIn, setCheckedIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>(storedCurrency);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
      disableSound();
    };
  }, []);

  useEffect(() => {
    if (!padOpen) return;
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePad();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [padOpen]);

  const say = (message: string) => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const sfx = (name: string) => {
    if (soundOn) playSfx(name);
  };

  const openPad = () => {
    setAmount('');
    setPadOpen(true);
    sfx('tap');
  };

  const closePad = () => {
    setPadOpen(false);
    setAmount('');
    requestAnimationFrame(() => openButtonRef.current?.focus());
  };

  const handleKey = (key: NumberPadKey) => {
    sfx('tap');
    setAmount((value) => {
      if (key === 'back') return value.slice(0, -1);
      if (key === '.') {
        if (value.includes('.')) return value;
        return value === '' ? '0.' : `${value}.`;
      }
      if (value.includes('.') && value.split('.')[1]!.length >= 2) return value;
      if (value.replace('.', '').length >= 7) return value;
      if (value === '0') return key;
      return value + key;
    });
  };

  const logExpense = () => {
    const value = Number(amount);
    if (!(value > 0)) return;
    sfx('coin');
    setPadOpen(false);
    setAmount('');
    say(
      `Logged ${formatMoney(Math.round(value * 100), currency)} in this mock. Nothing was saved.`,
    );
    requestAnimationFrame(() => openButtonRef.current?.focus());
  };

  const changeCurrency = (next: string) => {
    if (!isCurrencyCode(next) || next === currency) return;
    setCurrency(next);
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit when storage is unavailable.
    }
    sfx('tap');
    say(`Currency set to ${next}. Sample amounts are not converted.`);
  };

  const checkIn = () => {
    if (checkedIn) return;
    setCheckedIn(true);
    sfx('confirm');
    say('Checked in. Seven days steady · mock only, nothing saved.');
  };

  const toggleSound = async () => {
    if (soundOn) {
      disableSound();
      setSoundOn(false);
      say('Sound off.');
      return;
    }
    const ok = await enableSound();
    setSoundOn(ok);
    if (ok) {
      playSfx('confirm');
      say('Sound on. Original chiptune, low volume.');
    } else {
      say('Audio is unavailable in this browser.');
    }
  };

  const displayAmount = `${currencySymbol(currency)}${amount || '0.00'}`;
  const canLog = Number(amount) > 0;

  return (
    <main className="shell today-shell">
      <header className="today-top">
        <Link className="back-link" to="/mock/foundation">
          <PixelText text="← Pocketrealm" color={C.amber2} pixelScale={2} />
        </Link>
        <Link className="back-link" to="/art">
          <PixelText text="Art preview →" color={C.amber2} pixelScale={2} />
        </Link>
      </header>

      <div className="today-heading">
        <div className="today-head">
          <p className="mock-badge">
            <PixelText text="Style lock · local mock" color={C.amber3} pixelScale={2} />
          </p>
          <h1 className="sr-only">Today</h1>
          <PixelText text="TODAY" color={C.paper0} pixelScale={6} className="today-wordmark" />
          <p className="today-date">
            <PixelText text={`${DATE_LABEL} · WEEK 4 OF 4`} color={C.paper3} pixelScale={2} />
          </p>
        </div>
        <div className="today-prefs">
          <label className="currency-picker">
            <span className="currency-label">
              <PixelText text="Currency · display only" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select"
              aria-label="Display currency"
              value={currency}
              onChange={(event) => changeCurrency(event.target.value)}
            >
              {CURRENCIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} {option.symbol}
                </option>
              ))}
            </select>
          </label>
          <PixelButton
            className="text-toggle"
            variant="secondary"
            aria-pressed={textMode === 'system'}
            onClick={() => {
              const next = textMode === 'system' ? 'pixel' : 'system';
              setTextMode(next);
              sfx('tap');
              say(
                next === 'system'
                  ? 'Readable text on · system face'
                  : 'Readable text off · bitmap face',
              );
            }}
          >
            <PixelText
              text={textMode === 'system' ? 'Readable text: on' : 'Readable text: off'}
              color={C.paper0}
              pixelScale={2}
            />
          </PixelButton>
        </div>
      </div>

      <PixelPanel className="today-hero" aria-labelledby="hero-title">
        <div className="hero-head">
          <div>
            <p className="eyebrow">
              <PixelText text="Rootfall Warren" color={C.amber3} pixelScale={2} />
            </p>
            <h2 id="hero-title" className="hero-title">
              <PixelText text="The lantern is lit" color={C.paper0} pixelScale={3} wrap={24} />
            </h2>
          </div>
          <span className="hero-status">
            <PixelText text="AMBIENT" color={C.moss2} pixelScale={2} />
          </span>
        </div>
        <div className="stage-frame today-stage">
          <RoomStage
            scale={wide ? 2 : 1}
            playing={!reducedMotion}
            parallax={!reducedMotion}
            alt="The lantern-lit Rootfall chamber, with torches, the Warden and the Tollbug"
          />
        </div>
        <p className="hero-note">
          <PixelText
            text={
              reducedMotion
                ? 'Reduced motion is on · the realm holds still'
                : 'Move across the room to shift the far and near layers'
            }
            color={C.paper3}
            pixelScale={2}
            wrap={30}
          />
        </p>
      </PixelPanel>

      <div className="today-grid">
        <div className="today-col">
          <PixelPanel tone="paper" className="safe-panel" aria-labelledby="safe-title">
            <div className="safe-head">
              <p id="safe-title" className="eyebrow ink">
                <PixelText text="Safe to spend" color={C.ink700} pixelScale={2} />
              </p>
              <span className="safe-days">
                <PixelText text="3 days left" color={C.paper0} pixelScale={2} />
              </span>
            </div>
            <div className="safe-amount">
              <PixelText text={formatMoney(SAFE_MINOR, currency)} color={C.ink900} pixelScale={4} />
              <span className="safe-amount-sub">
                <PixelText
                  text={`of ${formatMoney(WEEK_MINOR, currency)}`}
                  color={C.ink600}
                  pixelScale={2}
                />
              </span>
            </div>
            <Gauge
              value={SAFE_MINOR / WEEK_MINOR}
              label="Safe-to-spend remaining this week"
              tone="moss"
            />
            <div className="safe-meta">
              <span>
                <PixelText
                  text={`Spent ${formatMoney(WEEK_MINOR - SAFE_MINOR, currency)}`}
                  color={C.ink600}
                  pixelScale={2}
                />
              </span>
              <span>
                <PixelText text="Resets Monday" color={C.ink600} pixelScale={2} />
              </span>
            </div>
            <div className="today-stats">
              <span>
                <UiIcon name="oil" />
                <PixelText text="3 oil" color={C.ink700} pixelScale={2} />
              </span>
              <span>
                <UiIcon name="spark" />
                <PixelText
                  text={`${checkedIn ? 7 : 6}-day streak`}
                  color={C.ink700}
                  pixelScale={2}
                />
              </span>
              <span>
                <UiIcon name="coin" />
                <PixelText text="Lv 4" color={C.ink700} pixelScale={2} />
              </span>
            </div>
          </PixelPanel>

          <PixelPanel className="envelopes" aria-labelledby="envelopes-title">
            <h2 id="envelopes-title" className="panel-title">
              <PixelText text="Envelopes" color={C.paper0} pixelScale={3} />
            </h2>
            {ENVELOPES.map((envelope) => (
              <div className="envelope-row" key={envelope.name}>
                <div className="envelope-head">
                  <span>
                    <PixelText text={envelope.name} color={C.paper1} pixelScale={2} />
                  </span>
                  <span className="money">
                    <PixelText
                      text={`${formatMoney(envelope.limit - envelope.spent, currency)} left`}
                      color={C.amber2}
                      pixelScale={2}
                    />
                  </span>
                </div>
                <Gauge
                  value={envelope.spent / envelope.limit}
                  label={`${envelope.name} budget used`}
                  tone={envelope.tone}
                />
              </div>
            ))}
            <p className="panel-note">
              <PixelText
                text="Mock figures · real envelopes arrive with the data gate"
                color={C.paper3}
                pixelScale={2}
                wrap={34}
              />
            </p>
          </PixelPanel>
        </div>

        <div className="today-col">
          <PixelPanel className="actions-panel" aria-labelledby="actions-title">
            <h2 id="actions-title" className="panel-title">
              <PixelText text="Quick actions" color={C.paper0} pixelScale={3} wrap={24} />
            </h2>
            <PixelButton ref={openButtonRef} className="wide" onClick={openPad}>
              <UiIcon name="plus" size={20} />
              <PixelText text="Log expense" color={C.ink900} pixelScale={2} />
            </PixelButton>
            <PixelButton
              variant="secondary"
              className="wide"
              onClick={checkIn}
              disabled={checkedIn}
            >
              <UiIcon name="check" size={20} />
              <PixelText
                text={checkedIn ? 'Checked in' : 'Check in'}
                color={C.paper0}
                pixelScale={2}
              />
            </PixelButton>
          </PixelPanel>

          <PixelPanel className="delve-strip" aria-labelledby="delve-title">
            <img
              className="guardian-mini"
              src="/ui/ui-guardian-alert.png"
              width={48}
              height={48}
              alt=""
            />
            <div className="delve-copy">
              <h2 id="delve-title" className="panel-title">
                <PixelText text="Rootfall Warren" color={C.paper0} pixelScale={3} wrap={24} />
              </h2>
              <p>
                <PixelText
                  text="Floor 2 · Oil 3 · Autopilot waiting"
                  color={C.paper3}
                  pixelScale={2}
                  wrap={28}
                />
              </p>
            </div>
            <Link className="pixel-button secondary link-button" to="/art">
              <PixelText text="Watch" color={C.paper0} pixelScale={2} />
            </Link>
          </PixelPanel>

          <PixelPanel className="companion-panel" aria-labelledby="companion-title">
            <div className="companion-art">
              <AnimatedPixmap
                frames={warden.idle}
                frameMs={150}
                scale={2}
                playing={!reducedMotion}
                alt="Mossling Warden breathing beside its lantern"
              />
            </div>
            <div className="companion-copy">
              <h2 id="companion-title" className="panel-title">
                <PixelText text="Mossling Warden" color={C.paper0} pixelScale={3} wrap={24} />
              </h2>
              <p>
                <PixelText
                  text="The lantern is steady. Six days of small choices."
                  color={C.paper3}
                  pixelScale={2}
                  wrap={26}
                />
              </p>
            </div>
            <PixelButton
              variant="secondary"
              className="sound-toggle"
              aria-pressed={soundOn}
              onClick={() => void toggleSound()}
            >
              <UiIcon name="music" size={20} />
              <PixelText
                text={soundOn ? 'Sound on' : 'Sound off'}
                color={C.paper0}
                pixelScale={2}
              />
            </PixelButton>
          </PixelPanel>
        </div>
      </div>

      <footer className="art-footer">
        <PixelText
          text="Style-lock mock · currency is a display choice, not a conversion · nothing leaves this device · no accounts, no trackers"
          color={C.paper3}
          pixelScale={2}
          wrap={44}
          align="center"
        />
      </footer>

      {toast && (
        <p className="toast" role="status">
          <PixelText text={toast} color={C.paper0} pixelScale={2} wrap={34} />
        </p>
      )}

      {padOpen && (
        <div
          className="sheet-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closePad();
          }}
        >
          <PixelPanel
            className="numpad-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="numpad-title"
          >
            <div className="sheet-head">
              <div>
                <p className="eyebrow">
                  <PixelText text="Quick add" color={C.amber3} pixelScale={2} />
                </p>
                <h2 id="numpad-title" className="panel-title">
                  <PixelText text="Expense" color={C.paper0} pixelScale={3} />
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="sheet-close"
                aria-label="Close number pad"
                onClick={closePad}
              >
                <PixelText text="×" color={C.paper0} pixelScale={2} />
              </button>
            </div>
            <div className="numpad-display">
              <PixelText text={displayAmount} color={C.paper0} pixelScale={3} />
              <p>
                <PixelText
                  text="Mock entry · nothing is saved"
                  color={C.paper3}
                  pixelScale={2}
                  wrap={22}
                  align="right"
                />
              </p>
            </div>
            <NumberPad onKey={handleKey} />
            <PixelButton className="wide" disabled={!canLog} onClick={logExpense}>
              <PixelText text="Log mock expense" color={C.ink900} pixelScale={2} />
            </PixelButton>
          </PixelPanel>
        </div>
      )}
    </main>
  );
}
