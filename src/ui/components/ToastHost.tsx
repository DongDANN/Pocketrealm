import { C } from '../../art/palette';
import { toasts, useToasts } from '../lib/toast';
import { PixelText } from './PixelText';

/** Polite live region at the bottom of the app; every action's answer appears here. */
export function ToastHost() {
  const items = useToasts();
  if (items.length === 0) return null;
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {items.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <div className="toast-text">
            <PixelText text={toast.text} color={C.paper0} pixelScale={2} wrap={34} />
          </div>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss message"
            onClick={() => toasts.dismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
