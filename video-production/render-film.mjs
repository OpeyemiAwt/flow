import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_URL = `file://${path.join(__dirname, "studio", "index.html")}`;
const AUDIO_3MIN = path.join(__dirname, "audio-3min", "flow-3min-female-vo.m4a");
const RENDERS_DIR = path.join(__dirname, "renders");
const ARTIFACT_DIR = "/Users/user/.gemini/antigravity/brain/f76c92d9-9071-4143-87d6-50920f778076";

mkdirSync(RENDERS_DIR, { recursive: true });

const FFMPEG = "/Users/user/.local/bin/ffmpeg";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function renderVideoRange(page, { startSec, durationSec, fps, audioPath, audioSeekSec = 0, outputMp4 }) {
  const totalFrames = Math.round(durationSec * fps);
  const args = [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", String(fps),
    "-i", "-",
    "-ss", String(audioSeekSec),
    "-t", String(durationSec),
    "-i", audioPath,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-shortest",
    outputMp4,
  ];

  const ff = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ff.stderr.on("data", (d) => { stderr += d.toString(); });

  for (let f = 0; f < totalFrames; f++) {
    const sec = startSec + f / fps;
    await page.evaluate((s) => window.__setVideoFrame("master", s), sec);
    const buf = await page.screenshot({ type: "jpeg", quality: 94 });
    const ok = ff.stdin.write(buf);
    if (!ok) {
      await new Promise((r) => ff.stdin.once("drain", r));
    }
  }
  ff.stdin.end();

  await new Promise((resolve, reject) => {
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function main() {
  const mode = process.argv[2] || "all";
  console.log("1. Launching headless Chrome (1920x1080)...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(STUDIO_URL, { waitUntil: "networkidle" });

  console.log("2. Capturing 8 high-resolution verification keyframes across the 3:00 timeline...");
  const keyframes = [
    { sec: 2.4, file: "v2-frame-01-kinetic-hook.png" },
    { sec: 6.2, file: "v2-frame-02-concentric-rings.png" },
    { sec: 13.8, file: "v2-frame-03-logo-elements-assemble.png" },
    { sec: 17.5, file: "v2-frame-04-logo-full-lockup.png" },
    { sec: 38.5, file: "v2-frame-05-onboarding-progressbar.png" },
    { sec: 52.0, file: "v2-frame-06-dashboard-liquid-glass.png" },
    { sec: 76.5, file: "v2-frame-07-receive-near-network.png" },
    { sec: 88.0, file: "v2-frame-08-convert-live-quote.png" },
    { sec: 130.0, file: "v2-frame-09-checkout-sol-to-near.png" },
    { sec: 168.0, file: "v2-frame-10-settings-and-ai-mascot.png" },
  ];

  for (const kf of keyframes) {
    await page.evaluate((s) => window.__setVideoFrame("master", s), kf.sec);
    const outPath = path.join(RENDERS_DIR, kf.file);
    await page.screenshot({ path: outPath, type: "png" });
    if (existsSync(ARTIFACT_DIR)) {
      copyFileSync(outPath, path.join(ARTIFACT_DIR, kf.file));
    }
  }

  if (mode === "stills") {
    await browser.close();
    console.log("Captured all verification keyframes!");
    return;
  }

  console.log("3. Rendering Full 3-Minute (180.0s) Master Film MP4 (1920x1080 @ 15fps)...");
  const masterMp4 = path.join(RENDERS_DIR, "flow-explainer-3min-master.mp4");
  await renderVideoRange(page, {
    startSec: 0,
    durationSec: 180,
    fps: 15,
    audioPath: AUDIO_3MIN,
    audioSeekSec: 0,
    outputMp4: masterMp4,
  });

  console.log("4. Rendering 22-Second Intro + Authentic Logo Reveal MP4 (1920x1080 @ 24fps)...");
  const teaserMp4 = path.join(RENDERS_DIR, "flow-teaser-15s-logo-reveal.mp4");
  await renderVideoRange(page, {
    startSec: 0,
    durationSec: 22,
    fps: 24,
    audioPath: AUDIO_3MIN,
    audioSeekSec: 0,
    outputMp4: teaserMp4,
  });

  if (existsSync(ARTIFACT_DIR)) {
    copyFileSync(masterMp4, path.join(ARTIFACT_DIR, "flow-explainer-3min-master.mp4"));
    copyFileSync(teaserMp4, path.join(ARTIFACT_DIR, "flow-teaser-15s-logo-reveal.mp4"));
    copyFileSync(AUDIO_3MIN, path.join(ARTIFACT_DIR, "flow-3min-female-vo.m4a"));
  }

  await browser.close();
  console.log("All 3-minute master and teaser MP4 renders complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
