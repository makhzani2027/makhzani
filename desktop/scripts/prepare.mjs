// يجهّز resources/ لبناء البرنامج: ملفات قاعدة البيانات (نفس النظام أونلاين) + لوحة التحكم المبنية لوضع الحاسوب.
//   node scripts/prepare.mjs            ← sql فقط
//   node scripts/prepare.mjs --admin    ← وأيضاً يبني لوحة التحكم وينسخها
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desk = path.resolve(here, '..');
const root = path.resolve(desk, '..');
const res = path.join(desk, 'resources');
const sql = path.join(res, 'sql');
fs.rmSync(sql, { recursive: true, force: true });
fs.mkdirSync(path.join(sql, 'migrations'), { recursive: true });
fs.copyFileSync(path.join(root, 'supabase/tests/supabase_stub.sql'), path.join(sql, 'stub.sql'));
fs.copyFileSync(path.join(root, 'supabase/seed.sql'), path.join(sql, 'seed.sql'));
for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).filter((x) => x.endsWith('.sql'))) {
  fs.copyFileSync(path.join(root, 'supabase/migrations', f), path.join(sql, 'migrations', f));
}
console.log(`✓ sql: ${fs.readdirSync(path.join(sql, 'migrations')).length} migrations`);

if (process.argv.includes('--admin')) {
  execSync('npm run build -w @raqeem/admin', {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, VITE_LOCAL: '1', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', ADMIN_BASE: '/' },
  });
  fs.rmSync(path.join(res, 'admin'), { recursive: true, force: true });
  fs.cpSync(path.join(root, 'apps/admin/dist'), path.join(res, 'admin'), { recursive: true });
  console.log('✓ admin');
}
fs.mkdirSync(path.join(res, 'bin'), { recursive: true });
