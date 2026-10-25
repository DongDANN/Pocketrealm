import { UI_ASSETS } from '../src/art/ui';
import { savePixmap } from './lib/png';

for (const asset of UI_ASSETS) {
  const name = asset.key.replaceAll('.', '-');
  savePixmap(`public/ui/${name}.png`, asset.pix);
}
console.log(`Wrote ${UI_ASSETS.length} UI assets to public/ui`);
