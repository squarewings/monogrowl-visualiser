#!/usr/bin/env node
// Render Instagram Stories video (9:16, 1080x1920, 60fps) from the visualiser
// Runs on Mac with puppeteer + ffmpeg
import puppeteer from 'puppeteer';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 540;
const HEIGHT = 960;
const FPS = 30;
const DURATION_SECS = 15; // 15s — max for a single Instagram Story
const TOTAL_FRAMES = FPS * DURATION_SECS;
const FRAMES_DIR = '/tmp/viz-frames';
const OUTPUT = path.join(__dirname, 'dist', 'monogrowl-overflown-stories.mp4');
const AUDIO = path.join(__dirname, 'dist', 'overflown.mp3');

// Clean up frames dir
if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

console.log(`Rendering ${DURATION_SECS}s at ${WIDTH}x${HEIGHT} @ ${FPS}fps (${TOTAL_FRAMES} frames)...`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    `--window-size=${WIDTH},${HEIGHT}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--disable-dev-shm-usage',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

// Load the local HTML
const htmlPath = `file://${path.resolve(__dirname, 'dist', 'index.html')}`;
console.log(`Loading ${htmlPath}`);
await page.goto(htmlPath, { waitUntil: 'networkidle0', timeout: 30000 });

// Auto-start in demo/wireframe city mode
await page.evaluate(() => {
  window._demoFallback = true;
  if (typeof demoMode !== 'undefined') demoMode = true;
  isPlaying = true;
  const prompt = document.getElementById('playPrompt');
  if (prompt) prompt.classList.add('hidden');
  mode = 0;
  if (typeof updateCanvasVisibility === 'function') updateCanvasVisibility();
});

// Wait for city to fully initialize and render a few frames
console.log('Waiting for city to initialize...');
await new Promise(r => setTimeout(r, 5000));

// Capture frames
const startTime = Date.now();
for (let i = 0; i < TOTAL_FRAMES; i++) {
  const frameNum = String(i).padStart(6, '0');
  await page.screenshot({
    path: `${FRAMES_DIR}/frame_${frameNum}.jpg`,
    type: 'jpeg',
    quality: 95,
    optimizeForSpeed: true,
  });

  if (i > 0 && i % FPS === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const fps = (i / (Date.now() - startTime) * 1000).toFixed(1);
    console.log(`  ${i}/${TOTAL_FRAMES} frames (${elapsed}s, ${fps} capture fps)`);
  }
}

const captureTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`Frame capture complete in ${captureTime}s`);

await browser.close();

// Encode with ffmpeg
console.log('Encoding video with ffmpeg...');
const ffmpegCmd = [
  'ffmpeg', '-y',
  '-framerate', String(FPS),
  '-i', `${FRAMES_DIR}/frame_%06d.jpg`,
  '-i', AUDIO,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '18',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-pix_fmt', 'yuv420p',
  '-t', String(DURATION_SECS),
  '-shortest',
  '-movflags', '+faststart',
  '-vf', 'scale=1080:1920:flags=lanczos',
  OUTPUT,
].join(' ');

execSync(ffmpegCmd, { stdio: 'inherit' });

// Clean up
fs.rmSync(FRAMES_DIR, { recursive: true });

const stats = fs.statSync(OUTPUT);
console.log(`\nDone! ${OUTPUT} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
