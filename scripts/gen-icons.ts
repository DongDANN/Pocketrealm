import { lanternMark } from '../src/art/brand';
import { scalePixmap } from '../src/art/px';
import { savePixmap } from './lib/png';

const out = 'public/icons';
const base = lanternMark(32, false);
const maskable = lanternMark(32, true);

savePixmap(`${out}/icon-192.png`, scalePixmap(base, 6));
savePixmap(`${out}/icon-512.png`, scalePixmap(base, 16));
savePixmap(`${out}/maskable-512.png`, scalePixmap(maskable, 16));
savePixmap(`${out}/apple-touch-icon.png`, scalePixmap(base, 6));
savePixmap(`${out}/favicon-32.png`, base);

console.log('Wrote PWA icons to', out);
