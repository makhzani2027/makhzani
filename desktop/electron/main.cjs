// رقيم لسطح المكتب — نافذة البرنامج. الخلفية (قاعدة البيانات والبوابة) تعمل داخل هذا البرنامج على 127.0.0.1 فقط.
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PORT = 47831; // ثابت: جلسة الدخول المحفوظة في المتصفح مرتبطة بالعنوان
let win = null;
let backend = null;
let gateway = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
const cfgFile = () => path.join(app.getPath('userData'), 'raqeem.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } }
function writeCfg(c) { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2)); }

/** مجلد البيانات الافتراضي: D:\Raqeem إن وُجد القرص D، وإلا «المستندات\Raqeem» */
function defaultRoot() {
  if (process.platform === 'win32' && fs.existsSync('D:\\')) {
    try { fs.mkdirSync('D:\\Raqeem', { recursive: true }); fs.accessSync('D:\\Raqeem', fs.constants.W_OK); return 'D:\\Raqeem'; } catch { /* قرص للقراءة فقط */ }
  }
  return path.join(app.getPath('documents'), 'Raqeem');
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
    adminDir: path.join(resources, 'admin'), port: PORT, version: app.getVersion(),
    desktop: {
      chooseFolder: async () => {
        const r = await dialog.showOpenDialog(win, { title: 'اختر مكان حفظ بيانات رقيم', properties: ['openDirectory', 'createDirectory'] });
        return r.canceled ? null : r.filePaths[0];
      },
      saveRoot: (root) => { const c = readCfg(); c.root = root; writeCfg(c); },
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${PORT}`)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${PORT}`)) { e.preventDefault(); void shell.openExternal(url); } });
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'رقيم', submenu: [{ role: 'reload', label: 'تحديث' }, { role: 'togglefullscreen', label: 'ملء الشاشة' }, { type: 'separator' }, { role: 'quit', label: 'خروج' }] },
  { label: 'تحرير', submenu: [{ role: 'undo', label: 'تراجع' }, { role: 'redo', label: 'إعادة' }, { type: 'separator' }, { role: 'cut', label: 'قص' }, { role: 'copy', label: 'نسخ' }, { role: 'paste', label: 'لصق' }, { role: 'selectAll', label: 'تحديد الكل' }] },
  { label: 'عرض', submenu: [{ role: 'zoomIn', label: 'تكبير' }, { role: 'zoomOut', label: 'تصغير' }, { role: 'resetZoom', label: 'الحجم الأصلي' }, { type: 'separator' }, { role: 'toggleDevTools', label: 'أدوات المطوّر' }] },
]));

app.whenReady().then(start).catch((e) => { dialog.showErrorBox('رقيم', String(e && e.message || e)); app.quit(); });

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting || !backend) return;
  e.preventDefault();
  quitting = true;
  // إغلاق نظيف لقاعدة البيانات قبل الخروج (حتى لا تبقى تعمل في الخلفية)
  Promise.resolve(backend.closeAccount()).catch(() => {}).finally(() => { gateway?.close().catch(() => {}); app.quit(); });
});
app.on('window-all-closed', () => app.quit());
