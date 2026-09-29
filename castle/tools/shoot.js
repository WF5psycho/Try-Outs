// Headless screenshot harness for the critic loop.
// usage: node tools/shoot.js <outDir> [spp=48] [w=960] [h=540] [views=comma list] [extra=json params]
const path = require('path');
const fs = require('fs');
const http = require('http');
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }

const root = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] || 'shots');
const spp = parseInt(process.argv[3] || '48', 10);
const W = parseInt(process.argv[4] || '960', 10), H = parseInt(process.argv[5] || '540', 10);
// views separated by ';' (or ',' when no custom cam: specs are used). presets: name@night|golden|noon|rain
const vArg = process.argv[6] || 'exterior;approach;aerial;greathall;greathall2;library;kitchen;entrance;bedroom';
const viewList = vArg.includes(';') || vArg.startsWith('cam:') ? vArg.split(';').filter(Boolean) : vArg.split(',');
const extra = process.argv[7] ? JSON.parse(process.argv[7]) : {};

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/index.html?shot=1&resScale=1`);
  await page.waitForFunction(() => window.__castleReady || window.__castleError, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__castleError);
  if (err) { console.error('ERROR', err); await browser.close(); server.close(); process.exit(1); }
  await page.addStyleTag({ content: '#panel,#help,#status{display:none!important}' });
  for (const spec of viewList) {
    const [name, preset] = spec.split('@');
    const params = Object.assign({}, extra);
    if (preset === 'night') Object.assign(params, { time: 22.0 });
    if (preset === 'golden') Object.assign(params, { time: 18.6 });
    if (preset === 'noon') Object.assign(params, { time: 13.0 });
    if (preset === 'rain') Object.assign(params, { cloud: 1.0, rain: 1.0, haze: 0.4 });
    let view = name;
    if (name.startsWith('cam:')) {
      // cam:x,y,z,tx,ty,tz  (camera position and look-at target, metres)
      const v = name.slice(4).split(',').map(Number);
      view = { pos: v.slice(0, 3), target: v.slice(3, 6), fly: true };
    }
    await page.evaluate(([n, p]) => { window.castleAPI.set(Object.assign({ time: 16.2, cloud: 0.3, rain: 0, haze: 0.12 }, p)); window.castleAPI.setView(n); }, [view, params]);
    const r = await page.evaluate((s) => window.castleAPI.render(s, 1), spp);
    const file = path.join(outDir, `${spec.replace('@', '_').replace(/[^a-zA-Z0-9_.-]/g, '_')}.png`);
    await page.locator('#view').screenshot({ path: file });
    console.log(`${spec}: ${r.spp} spp in ${(r.ms / 1000).toFixed(1)}s, exposure ${r.exposure.toFixed(3)} -> ${file}`);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
