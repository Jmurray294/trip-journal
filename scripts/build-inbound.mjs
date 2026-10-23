// Builds supabase/functions/inbound-email/index.ts from template.ts with the app's confirmation
// parser (src/lib/parser.js) and loyalty-program matching (src/lib/loyalty.js) inlined, so the server
// and the app read emails and match programs the same way.
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

writeFileSync(new URL('index.ts', dir), template.replace('/*__PARSER__*/', parser).replace('/*__LOYALTY__*/', loyalty));
console.log('wrote supabase/functions/inbound-email/index.ts');
