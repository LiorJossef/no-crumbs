// Manual probe (FIX-ERR-SEC): prints what a real failure now looks like in the log line, to check
// the redaction did not make failures undiagnosable. Run: npx tsx tests/manual/describe-cause-redaction.manual.mts
import { describeCause } from '../../src/app/api/imports/_lib/error-reporting.js';

const inputs = [
  '(32.0578, 34.7702)',
  'Here you go: Cafe Levinsky at 32.0578, 34.7702',
  '[{"name":"Cafe","lat":32.0578,"lng":34.7702},]',
  '{"name":"Levinsky","lat":32.0578,"lng":NaN}',
  '```json\n{"places":[{"rawName":"Cafe Levinsky"}]}\n```',
  '',
  '{"a":"xxxxxxxxxx","lat":32.0578,"lng":NaN}',
  '{"lat":32.0578,"a":NaN}',
  '{"places":[{"rawName":"x","lat":32.0578,"lng":34.7702,"note":nope}]}',
];
for (const i of inputs) {
  try { JSON.parse(i); } catch (e) { console.log(JSON.stringify(i.slice(0, 30)), '=>', describeCause(e)); }
}
const dns = Object.assign(new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com'), { code: 'ENOTFOUND' });
console.log('fetch chain =>', describeCause(new TypeError('fetch failed', { cause: dns })));
console.log('pgrst       =>', describeCause({ message: 'permission denied for function start_import', code: '42501', details: 'Key (x)=(caption) exists' }));
