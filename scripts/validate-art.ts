import { pathToFileURL } from 'node:url';
import {
  artSpecs,
  previewCounts,
  uiAssetCount,
  validateExports,
  validateFrames,
} from './lib/art-validate';

function main(): number {
  const specs = artSpecs();
  const frames = specs.reduce((sum, spec) => sum + spec.frames.length, 0);
  const counts = previewCounts();
  const issues = [...specs.flatMap(validateFrames), ...validateExports()];
  console.log('Pocketrealm art validation');
  console.log(`  assets: ${specs.length} (${frames} frames)`);
  console.log(
    `  exports: ${counts.pngs} preview PNGs, ${counts.gifs} animated GIFs, ${uiAssetCount()} UI PNGs`,
  );
  if (issues.length === 0) {
    console.log('  result: PASS - palette, canvas sizes, frame counts and exports are valid');
    return 0;
  }
  console.log(`  result: FAIL - ${issues.length} issue${issues.length === 1 ? '' : 's'}`);
  for (const issue of issues) console.log(`  - ${issue.key}: ${issue.message}`);
  return 1;
}

const entry = process.argv[1];
const direct = entry !== undefined && import.meta.url === pathToFileURL(entry).href;
if (direct) process.exitCode = main();
