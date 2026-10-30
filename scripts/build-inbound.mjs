// Builds supabase/functions/inbound-email/index.ts from template.ts with the app's confirmation
// parser (src/lib/parser.js), loyalty-program matching (src/lib/loyalty.js) and photo filing
// (src/lib/photos.js) inlined, so the server and the app read emails, match programs and file photos
// the same way.
// The Supabase dashboard editor deploys a single file, hence inlining instead of importing.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../supabase/functions/inbound-email/', import.meta.url);
const template = readFileSync(new URL('template.ts', dir), 'utf8');
const parser = readFileSync(new URL('../src/lib/parser.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '')
  .replace(/^/, '// ---- inlined from src/lib/parser.js ----\n// deno-lint-ignore-file\n');

const loyalty = readFileSync(new URL('../src/lib/loyalty.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '')
  .replace(/^/, '// ---- inlined from src/lib/loyalty.js ----\n');

const photos = readFileSync(new URL('../src/lib/photos.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '')
  .replace(/^/, '// ---- inlined from src/lib/photos.js ----\n');

const out = template.replace('/*__PARSER__*/', parser).replace('/*__LOYALTY__*/', loyalty).replace('/*__PHOTOS__*/', photos);
// Plain ASCII, every other character as a \u escape: copying the file into the dashboard editor
// through a Windows console turned "·" into "┬╖" (and "—" likewise) in saved trips.
writeFileSync(new URL('index.ts', dir), out.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
console.log('wrote supabase/functions/inbound-email/index.ts');
