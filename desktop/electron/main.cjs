// رقيم لسطح المكتب — نافذة البرنامج. الخلفية (قاعدة البيانات والبوابة) تعمل داخل هذا البرنامج على 127.0.0.1 فقط.
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PORT = 47831; // ثابت: جلسة الدخول المحفوظة في المتصفح مرتبطة بالعنوان
let win = null;
let backend = null;
let gateway = null;

const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
const cfgFile = () => path.join(app.getPath('userData'), 'raqeem.json');
// كتابة آمنة: ملف مؤقت ثم استبدال (انقطاع الكهرباء لا يترك ملفاً فارغاً يضيّع مجلد البيانات وسر الجلسات)
function writeCfg(c) {
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  const tmp = `${cfgFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  try { if (fs.existsSync(cfgFile())) fs.copyFileSync(cfgFile(), `${cfgFile()}.bak`); } catch { /* */ }
  fs.renameSync(tmp, cfgFile());
}
function readCfg() {
  for (const f of [cfgFile(), `${cfgFile()}.bak`]) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* التالي */ } }
  return {};
}

/** مجلد البيانات الافتراضي: D:\Raqeem إن وُجد القرص D، وإلا مجلد المستخدم\Raqeem (خارج OneDrive: مزامنته تُتلف قاعدة البيانات) */
function defaultRoot() {
  if (process.platform === 'win32' && fs.existsSync('D:\\')) {
    try { fs.mkdirSync('D:\\Raqeem', { recursive: true }); fs.accessSync('D:\\Raqeem', fs.constants.W_OK); return 'D:\\Raqeem'; } catch { /* قرص للقراءة فقط */ }
  }
  const home = path.join(app.getPath('home'), 'Raqeem');
  // اسم مستخدم بحروف غير لاتينية: Postgres على ويندوز قد لا يقبل المسار ← C:\Raqeem
  if (process.platform === 'win32' && /[^\x20-\x7e]/.test(home)) return 'C:\\Raqeem';
  return home;
}

async function start() {
  const cfg = readCfg();
  if (!cfg.secret) cfg.secret = crypto.randomBytes(32).toString('hex');
  if (process.env.RAQEEM_ROOT) cfg.root = process.env.RAQEEM_ROOT;
  if (!cfg.root) cfg.root = defaultRoot();
  writeCfg(cfg);
  // ويندوز: استيراد وحدات ESM بمسار file:// (المسار C:\… وحده يُرفض)
  const { pathToFileURL } = require('node:url');
  const { Backend } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'backend.mjs')).href);
  const { createGateway } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'gateway.mjs')).href);
  const logFile = path.join(app.getPath('userData'), 'raqeem.log');
  const log = (m) => { try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${m}\n`); } catch { /* */ } };
  backend = new Backend({
    root: cfg.root, resources, secret: cfg.secret, log,
    postgrest: path.join(resources, 'bin', process.platform === 'win32' ? 'postgrest.exe' : 'postgrest'),
  });
  gateway = createGateway(backend, {
    adminDir: path.join(resources, 'admin'), port: PORT, version: app.getVersion(), logFile,
    desktop: {
      chooseFolder: async () => {
        const r = await dialog.showOpenDialog(win, { title: 'اختر مكان حفظ بيانات رقيم', properties: ['openDirectory', 'createDirectory'] });
        return r.canceled ? null : r.filePaths[0];
      },
      saveRoot: (root) => { const c = readCfg(); c.root = root; c.root_chosen = true; writeCfg(c); },
      rootChosen: () => !!process.env.RAQEEM_ROOT || !!readCfg().root_chosen,
      openPath: (p) => { void shell.openPath(p); },
    },
  });
  try {
    await gateway.listen();
  } catch (e) {
    dialog.showErrorBox('رقيم', `تعذّر تشغيل البرنامج: المنفذ ${PORT} مستعمل. أغلق نسخة رقيم الأخرى وأعد المحاولة.`);
    app.quit();
    return;
  }
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, title: 'رقيم', backgroundColor: '#EDEEEC', show: false,
    icon: path.join(resources, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // الروابط الخارجية (واتساب، الخرائط) تُفتح في المتصفح، واللوحة تبقى داخل البرنامج
  const ours = (u) => { try { return new URL(u).origin === `http://127.0.0.1:${PORT}`; } catch { return false; } };
  // روابط خارجية آمنة فقط (واتساب، خرائط، بريد، هاتف) — لا file: ولا برامج النظام
  const openOut = (u) => { try { if (/^(https?|mailto|tel):$/.test(new URL(u).protocol)) void shell.openExternal(u); } catch { /* */ } };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (ours(url)) return { action: 'allow' };
    openOut(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!ours(url)) { e.preventDefault(); openOut(url); } });
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
  setupUpdates();
}

// ---------------------------------------------------------------- التحديث التلقائي
// يفحص عند التشغيل ثم كل ٤ ساعات (إن وُجد إنترنت)، ينزّل التحديث بالخلفية، ثم يسأل: إعادة التشغيل الآن أم عند الإغلاق.
// بلا إنترنت: لا شيء يتغير، والبرنامج يعمل كالعادة.
let updateReady = false;
function setupUpdates() {
  if (!app.isPackaged || process.env.RAQEEM_ROOT) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  const log = (m) => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'raqeem.log'), `${new Date().toISOString()} update: ${m}\n`); } catch { /* */ } };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };
  autoUpdater.on('error', (e) => log(`error ${e && e.message}`));
  autoUpdater.on('update-available', (i) => log(`available ${i && i.version}`));
  let asked = '';
  autoUpdater.on('update-downloaded', async (i) => {
    updateReady = true;
    // نسأل مرة واحدة لكل إصدار (الفحص الدوري لا يكرر الرسالة)
    if (!win || asked === String(i && i.version)) return;
    asked = String(i && i.version);
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['إعادة التشغيل الآن', 'لاحقاً'], defaultId: 0, cancelId: 1,
      title: 'رقيم', message: `تحديث جديد لرقيم جاهز (${i && i.version ? i.version : ''})`,
      detail: 'بياناتك لا تتأثر. إن اخترت «لاحقاً» يُثبَّت التحديث تلقائياً عند إغلاق البرنامج.',
    });
    if (r.response === 0) { quitForUpdate = true; app.quit(); }
  });
  const check = () => autoUpdater.checkForUpdates().catch((e) => log(`check failed ${e && e.message}`));
  setTimeout(check, 15_000);
  setInterval(check, 4 * 3600_000);
  installUpdate = () => { try { autoUpdater.quitAndInstall(true, true); } catch (e) { log(`install failed ${e && e.message}`); } };
}
let quitForUpdate = false;
let installUpdate = null;

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'رقيم', submenu: [{ role: 'reload', label: 'تحديث' }, { role: 'togglefullscreen', label: 'ملء الشاشة' }, { type: 'separator' }, { role: 'quit', label: 'خروج' }] },
  { label: 'تحرير', submenu: [{ role: 'undo', label: 'تراجع' }, { role: 'redo', label: 'إعادة' }, { type: 'separator' }, { role: 'cut', label: 'قص' }, { role: 'copy', label: 'نسخ' }, { role: 'paste', label: 'لصق' }, { role: 'selectAll', label: 'تحديد الكل' }] },
  { label: 'عرض', submenu: [{ role: 'zoomIn', label: 'تكبير' }, { role: 'zoomOut', label: 'تصغير' }, { role: 'resetZoom', label: 'الحجم الأصلي' }, { type: 'separator' }, { role: 'toggleDevTools', label: 'أدوات المطوّر' }] },
]));

function logFatal(e) {
  const msg = `${new Date().toISOString()} FATAL ${e && e.stack || e}\n`;
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.appendFileSync(path.join(app.getPath('userData'), 'raqeem.log'), msg); } catch { /* */ }
  try { process.stderr.write(msg); } catch { /* */ }
}
process.on('uncaughtException', logFatal);
process.on('unhandledRejection', logFatal);
if (primary) app.whenReady().then(start).catch((e) => {
  logFatal(e);
  // في الفحص الآلي لا نافذة خطأ (تمنع الإغلاق)
  if (!process.env.RAQEEM_ROOT) dialog.showErrorBox('رقيم', `تعذّر تشغيل البرنامج: ${String(e && e.message || e)}`);
  app.quit();
});

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting || !backend) return;
  e.preventDefault();
  quitting = true;
  // إغلاق نظيف لقاعدة البيانات قبل الخروج (حتى لا تبقى تعمل في الخلفية)
  Promise.resolve(backend.closeAccount()).catch(() => {}).finally(() => {
    gateway?.close().catch(() => {});
    // التحديث بعد إغلاق قاعدة البيانات بأمان
    if (quitForUpdate && updateReady && installUpdate) installUpdate(); else app.quit();
  });
});
app.on('window-all-closed', () => app.quit());
