const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const FPS = 30;
const DURATION = 30;
const TOTAL_FRAMES = FPS * DURATION;
const FRAME_DIR = path.resolve(__dirname, 'rec-frames');

async function record() {
  if (fs.existsSync(FRAME_DIR)) fs.rmSync(FRAME_DIR, { recursive: true });
  fs.mkdirSync(FRAME_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--use-gl=swiftshader', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  const filePath = path.resolve(__dirname, 'index.html');
  await page.goto(`file://${filePath}?demo`, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 1000));

  // Check WebGL support
  const webglOk = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      window._webglOk = !!gl;
      return !!gl;
    } catch(e) { window._webglOk = false; return false; }
  });
  console.log(`WebGL available: ${webglOk}`);
  const modeCount = webglOk ? 6 : 5;

  console.log(`Recording ${TOTAL_FRAMES} frames (${modeCount} modes)...`);

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const targetMode = Math.floor(i / (FPS * 5)) % modeCount;

    await page.evaluate((m) => {
      if (window.mode !== m) {
        window.mode = m;
        document.getElementById('modeLabel').textContent =
          ['waveform', 'bars', 'circles', 'particles', 'terrain', '3d sphere'][m];
        try { if (typeof updateCanvasVisibility === 'function') updateCanvasVisibility(); } catch(e) {}
      }
    }, targetMode);

    // Let the animation frame run
    await new Promise(r => setTimeout(r, 35));

    const frameNum = String(i).padStart(5, '0');
    await page.screenshot({
      path: path.join(FRAME_DIR, `frame_${frameNum}.png`),
      type: 'png'
    });

    if (i % 30 === 0) {
      const modeNames = ['waveform', 'bars', 'circles', 'particles', 'terrain', '3d sphere'];
      console.log(`  Frame ${i}/${TOTAL_FRAMES} (${Math.round(i/TOTAL_FRAMES*100)}%) — mode: ${modeNames[targetMode]}`);
    }
  }

  console.log('Recording complete!');
  await browser.close();
}

record().catch(e => { console.error(e); process.exit(1); });
