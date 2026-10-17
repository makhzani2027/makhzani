// يضبط توقيع نسخة الإصدار على مفتاح رقيم الخاص بدل مفتاح debug الذي يضعه قالب Expo.
// يُشغَّل بعد `expo prebuild` في .github/workflows/build-android.yml، ويقرأ من البيئة (لا قيم سرية في الملف):
//   RAQEEM_KEYSTORE (مسار الملف المفكوك)، RAQEEM_STORE_PASSWORD، RAQEEM_KEY_ALIAS، RAQEEM_KEY_PASSWORD
// build.gradle يقرأ القيم من البيئة وقت البناء، فلا تُكتب كلمة السر على القرص.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'mobile', 'android', 'app', 'build.gradle');
let g = fs.readFileSync(file, 'utf8');
for (const v of ['RAQEEM_KEYSTORE', 'RAQEEM_STORE_PASSWORD', 'RAQEEM_KEY_ALIAS', 'RAQEEM_KEY_PASSWORD']) {
  if (!process.env[v]) throw new Error(`المتغير ${v} غير موجود`);
}
if (!fs.existsSync(process.env.RAQEEM_KEYSTORE)) throw new Error('ملف المفتاح غير موجود');

if (g.includes("System.getenv('RAQEEM_KEYSTORE')")) {
  console.log('✓ التوقيع مضبوط مسبقاً');
  process.exit(0);
}

const releaseCfg = `    signingConfigs {
        release {
            storeFile file(System.getenv('RAQEEM_KEYSTORE'))
            storePassword System.getenv('RAQEEM_STORE_PASSWORD')
            keyAlias System.getenv('RAQEEM_KEY_ALIAS')
            keyPassword System.getenv('RAQEEM_KEY_PASSWORD')
            enableV1Signing true
            enableV2Signing true
            enableV3Signing true
        }
`;
if (!g.includes('    signingConfigs {\n')) throw new Error('لم أجد signingConfigs في build.gradle (تغيّر قالب Expo؟)');
g = g.replace('    signingConfigs {\n', releaseCfg);

// داخل buildTypes.release فقط: توقيع release بدل debug
const i = g.indexOf('        release {', g.indexOf('buildTypes {'));
if (i < 0) throw new Error('لم أجد buildTypes.release');
const j = g.indexOf('signingConfig signingConfigs.debug', i);
if (j < 0 || j - i > 600) throw new Error('لم أجد signingConfig داخل release');
g = g.slice(0, j) + 'signingConfig signingConfigs.release' + g.slice(j + 'signingConfig signingConfigs.debug'.length);

fs.writeFileSync(file, g);
console.log('✓ نسخة الإصدار ستُوقَّع بمفتاح رقيم الخاص');
