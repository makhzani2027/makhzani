// يبني ملفَي APK منفصلين حسب معالج الهاتف بدل ملف واحد لكل المعالجات (١٠٧ ميغا):
//   arm64-v8a  ← أغلب الهواتف الحديثة (raqeem.apk)
//   armeabi-v7a ← الهواتف القديمة/أندرويد 32 بت (raqeem-armv7.apk)
// x86/x86_64 للمحاكيات فقط فنحذفها، فيصغر الملف تحت حد التخزين المجاني (٥٠ ميغا) ويسرع البناء.
// يُشغَّل بعد `expo prebuild` في .github/workflows/build-android.yml. ملف AAB لـ Google Play يبقى واحداً.
const fs = require('fs');
const path = require('path');

const ABIS = ['armeabi-v7a', 'arm64-v8a'];
const android = path.join(__dirname, '..', 'apps', 'mobile', 'android');

const props = path.join(android, 'gradle.properties');
let p = fs.readFileSync(props, 'utf8');
p = /^reactNativeArchitectures=.*$/m.test(p)
  ? p.replace(/^reactNativeArchitectures=.*$/m, `reactNativeArchitectures=${ABIS.join(',')}`)
  : `${p.trimEnd()}\nreactNativeArchitectures=${ABIS.join(',')}\n`;
fs.writeFileSync(props, p);

const file = path.join(android, 'app', 'build.gradle');
let g = fs.readFileSync(file, 'utf8');
if (!g.includes('splits {')) {
  const block = `
    splits {
        abi {
            enable true
            reset()
            include ${ABIS.map((a) => `"${a}"`).join(', ')}
            universalApk false
        }
    }
`;
  if (!/^android\s*\{/m.test(g)) throw new Error('لم أجد كتلة android في build.gradle');
  g = g.replace(/^android\s*\{/m, (m) => m + block);
  fs.writeFileSync(file, g);
}
console.log(`✓ APK منفصل لكل معالج: ${ABIS.join('، ')}`);
