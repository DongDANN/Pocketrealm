import { PixelImage } from './PixelImage';
import { PixelText } from './PixelText';
import { iconBackspace } from '../../art/ui';
import { C } from '../../art/palette';

export type NumberPadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

const KEYS: readonly NumberPadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
];

const BACKSPACE = iconBackspace();

interface Props {
  onKey: (key: NumberPadKey) => void;
}

export function NumberPad({ onKey }: Props) {
  return (
    <div className="number-pad" role="group" aria-label="Number pad">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="num-key"
          onClick={() => onKey(key)}
          aria-label={key === 'back' ? 'Delete last digit' : key}
        >
          {key === 'back' ? (
            <PixelImage pixmap={BACKSPACE} scale={3} alt="" className="num-key-icon" />
          ) : (
            <PixelText text={key} color={C.ink900} pixelScale={3} className="num-key-icon" />
          )}
        </button>
      ))}
    </div>
  );
}
