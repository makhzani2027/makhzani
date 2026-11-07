// تشغيل البوابة بلا Electron (للتطوير والاختبار الآلي):
//   RAQEEM_ROOT=/tmp/raqeem RAQEEM_POSTGREST=/path/postgrest node server/cli.mjs [port]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Backend } from './backend.mjs';
import { createGateway } from './gateway.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const resources = process.env.RAQEEM_RESOURCES ?? path.resolve(here, '../resources');
const port = Number(process.argv[2] ?? 47831);
const backend = new Backend({
  root: process.env.RAQEEM_ROOT ?? path.resolve(here, '../.data'),
  resources,
  postgrest: process.env.RAQEEM_POSTGREST ?? path.join(resources, 'bin', process.platform === 'win32' ? 'postgrest.exe' : 'postgrest'),
  secret: process.env.RAQEEM_SECRET ?? 'dev-secret-0123456789abcdef0123456789abcdef',
  log: (m) => { if (process.env.RAQEEM_DEBUG) console.log(m); },
});
const gw = createGateway(backend, { adminDir: path.join(resources, 'admin'), port });
await gw.listen();
console.log(`رقيم المحلي يعمل: http://127.0.0.1:${port}/`);
const stop = async () => { await backend.closeAccount().catch(() => {}); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
