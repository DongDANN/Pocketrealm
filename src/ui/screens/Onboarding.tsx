import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lanternMark } from '../../art/brand';
import { C } from '../../art/palette';
import { speciesSprite } from '../../art/species';
import { SPECIES } from '../../core/companion';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
  parseAmount,
  type CurrencyCode,
} from '../../core/currency';
import { envelopesFromTemplate, TEMPLATES, templateById } from '../../core/templates';
import { completeOnboarding } from '../../data/onboard';
import { saveSettings } from '../../data/repos';
import { PixelImage } from '../components/PixelImage';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { useSession } from '../app/session';
import { say } from '../lib/toast';

const BRAND = lanternMark(32);
const LOCALES = ['en-PH', 'en-US', 'en-GB', 'en-SG', 'en-IN', 'de-DE', 'fr-FR'];

function deviceLocale(): string {
  try {
    return navigator.language || 'en-PH';
  } catch {
    return 'en-PH';
  }
}

/**
 * First run. One page rather than a long wizard: every part can be changed later, the defaults are
 * visible, and the only required field is the companion's name (already filled in). SPEC 7 asks for
 * about three minutes, skippable parts, and one plain privacy promise.
 */
export function Onboarding() {
  const { db, ctx } = useSession();
  const navigate = useNavigate();
  const [locale, setLocale] = useState(deviceLocale);
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [periodStartDay, setPeriodStartDay] = useState(1);
  const [income, setIncome] = useState('');
  const [templateId, setTemplateId] = useState(TEMPLATES[0]?.id ?? 'essentials');
  const [speciesKey, setSpeciesKey] = useState(SPECIES[0]?.key ?? 'mossling');
  const [companionName, setCompanionName] = useState('Warden');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const localeOptions = LOCALES.includes(locale) ? LOCALES : [locale, ...LOCALES];
  const coin: CurrencyCode = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;
  const parsedIncome = income.trim() === '' ? 0 : parseAmount(income);
  const template = templateById(templateId);
  const preview =
    template && parsedIncome !== null && parsedIncome > 0
      ? envelopesFromTemplate(template.id, parsedIncome, () => 'preview')
      : [];

  const finish = async () => {
    if (busy) return;
    if (parsedIncome === null) {
      setProblems([`“${income}” is not an amount. Use digits and a dot, like 25000 or 25000.50.`]);
      return;
    }
    if (companionName.trim() === '') {
      setProblems(['Your companion needs a name.']);
      return;
    }
    setBusy(true);
    setProblems([]);
    try {
      const result = await completeOnboarding(db, ctx, {
        currency,
        periodStartDay,
        templateId,
        income: parsedIncome,
        companionName,
        speciesKey,
      });
      if (!result.ok) {
        setProblems(result.problems);
        say(result.problems[0] ?? 'The book was not set up.', 'warn');
        return;
      }
      await saveSettings(db, { ...result.settings, locale });
      say(`The book is open. ${result.companion.name} is here.`, 'reward');
      navigate('/', { replace: true });
    } catch (error) {
      setProblems([error instanceof Error ? error.message : String(error)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell onboarding-shell">
      <section className="panel title-panel onboarding-title">
        <PixelImage pixmap={BRAND} scale={4} alt="A lantern glowing over a small floating island" />
        <h1 id="app-title" className="title">
          <PixelText text="Pocketrealm" color={C.paper0} pixelScale={4} align="center" />
        </h1>
        <p className="lede">
          <PixelText
            text="A calm budget companion, offline by design."
            color={C.paper1}
            pixelScale={2}
            wrap={34}
            align="center"
          />
        </p>
        <p className="privacy-promise">
          <img className="ui-icon" src="/ui/ui-icon-check.png" width={18} height={18} alt="" />
          <PixelText
            text="Your data stays on this device. No account, no sync, no tracking."
            color={C.moss1}
            pixelScale={2}
            wrap={36}
            align="center"
          />
        </p>
      </section>

      <PixelPanel className="onboard-panel" aria-labelledby="money-title">
        <h2 id="money-title" className="panel-title">
          <PixelText text="Money and language" color={C.paper0} pixelScale={3} wrap={24} />
        </h2>

        <div className="field-grid">
          <label className="field">
            <span className="field-label">
              <PixelText text="Currency (display only)" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select wide-select"
              aria-label="Currency"
              value={currency}
              onChange={(event) => {
                if (isCurrencyCode(event.target.value)) setCurrency(event.target.value);
              }}
            >
              {CURRENCIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} {option.symbol}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">
              <PixelText text="Language and dates" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select wide-select"
              aria-label="Locale"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
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
              <PixelText text="Monthly income" color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              inputMode="decimal"
              aria-label="Monthly income"
              placeholder="0.00"
              value={income}
              onChange={(event) => setIncome(event.target.value)}
            />
            <span className="field-note">
              <PixelText
                text={
                  parsedIncome && parsedIncome > 0
                    ? `Envelopes share ${formatMoney(parsedIncome, coin)}.`
                    : 'Leave blank for now; you can set allowances later.'
                }
                color={C.paper3}
                pixelScale={2}
                wrap={40}
              />
            </span>
          </label>

          <label className="field">
            <span className="field-label">
              <PixelText text="Period starts on day" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select wide-select"
              aria-label="Period start day"
              value={periodStartDay}
              onChange={(event) => setPeriodStartDay(Number(event.target.value))}
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <span className="field-note">
              <PixelText
                text="Days 1 to 28 keep every month the same length."
                color={C.paper3}
                pixelScale={2}
                wrap={40}
              />
            </span>
          </label>
        </div>
      </PixelPanel>

      <PixelPanel className="onboard-panel" aria-labelledby="template-title">
        <h2 id="template-title" className="panel-title">
          <PixelText text="Starter envelopes" color={C.paper0} pixelScale={3} wrap={24} />
        </h2>
        <div className="choice-stack" role="group" aria-label="Starter template">
          {TEMPLATES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === templateId ? 'choice-card on' : 'choice-card'}
              aria-pressed={option.id === templateId}
              onClick={() => setTemplateId(option.id)}
            >
              <span className="choice-head">
                <PixelText text={option.name} color={C.paper0} pixelScale={2} wrap={26} />
              </span>
              <span className="choice-body">
                <PixelText text={option.blurb} color={C.paper3} pixelScale={2} wrap={40} />
              </span>
            </button>
          ))}
        </div>
        {preview.length > 0 && (
          <ul className="slot-list">
            {preview.map((envelope, index) => (
              <li key={`${envelope.name}-${index}`}>
                <PixelText
                  text={`${envelope.name} · ${formatMoney(envelope.monthlyAllowance, coin)}`}
                  color={C.paper2}
                  pixelScale={2}
                />
              </li>
            ))}
          </ul>
        )}
        {template && template.slots.length === 0 && (
          <p className="panel-note">
            <PixelText
              text="You will start with no envelopes and can make them on the Jars screen."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        )}
      </PixelPanel>

      <PixelPanel className="onboard-panel" aria-labelledby="companion-title">
        <h2 id="companion-title" className="panel-title">
          <PixelText text="Choose a companion" color={C.paper0} pixelScale={3} wrap={24} />
        </h2>
        <div className="species-grid" role="group" aria-label="Companion species">
          {SPECIES.map((species) => (
            <button
              key={species.key}
              type="button"
              className={species.key === speciesKey ? 'species-card on' : 'species-card'}
              aria-pressed={species.key === speciesKey}
              aria-label={`${species.name}. ${species.blurb}`}
              onClick={() => setSpeciesKey(species.key)}
            >
              <PixelImage pixmap={speciesSprite(species, 1)} scale={3} alt="" />
              <span className="species-text">
                <span className="choice-head">
                  <PixelText text={species.name} color={C.paper0} pixelScale={2} />
                </span>
                <span className="choice-body">
                  <PixelText text={species.blurb} color={C.paper3} pixelScale={2} wrap={22} />
                </span>
              </span>
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">
            <PixelText text="Their name" color={C.paper3} pixelScale={2} />
          </span>
          <input
            className="text-input"
            aria-label="Companion name"
            value={companionName}
            maxLength={24}
            onChange={(event) => setCompanionName(event.target.value)}
          />
        </label>
      </PixelPanel>

      {problems.length > 0 && (
        <PixelPanel className="problem-panel" role="alert" aria-label="Setup problems">
          {problems.map((problem) => (
            <PixelText key={problem} text={problem} color={C.ember1} pixelScale={2} wrap={40} />
          ))}
        </PixelPanel>
      )}

      <div className="onboard-actions">
        <button
          type="button"
          className="pixel-button wide"
          disabled={busy}
          onClick={() => void finish()}
        >
          <img className="ui-icon" src="/ui/ui-icon-check.png" width={20} height={20} alt="" />
          <PixelText
            text={busy ? 'Opening the book' : 'Open my book'}
            color={C.ink900}
            pixelScale={3}
          />
        </button>
        <p className="panel-note">
          <PixelText
            text="You can change every choice later in Settings. Installing the app is optional and can wait."
            color={C.paper3}
            pixelScale={2}
            wrap={44}
            align="center"
          />
        </p>
      </div>
    </main>
  );
}
