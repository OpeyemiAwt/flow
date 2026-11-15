import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_URL = `file://${path.join(__dirname, "studio", "earn.html")}`;
const AUDIO_EARN = path.join(__dirname, "audio-earn", "flow-earn-vo.m4a");
const RENDERS_DIR = path.join(__dirname, "renders");
const ARTIFACT_DIR = "/Users/user/.gemini/antigravity/brain/f76c92d9-9071-4143-87d6-50920f778076";
const DOWNLOADS_DIR = "/Users/user/Downloads";

mkdirSync(RENDERS_DIR, { recursive: true });

const FFMPEG = "/Users/user/.local/bin/ffmpeg";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function renderVideoRange(page, { startSec, durationSec, fps, audioPath, outputMp4 }) {
  const totalFrames = Math.round(durationSec * fps);
  const args = [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", String(fps),
    "-i", "-",
    "-ss", "0",
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
    await page.evaluate((s) => window.__setVideoFrame("earn", s), sec);
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
  console.log("1. Launching headless Chrome (1920x1080) for FLOW Earn...");
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

  console.log("2. Capturing verification keyframes for FLOW Earn...");
  const keyframes = [
    { sec: 2.2, file: "earn-frame-01-kinetic-hook.png" },
    { sec: 6.5, file: "earn-frame-02-yield-rings.png" },
    { sec: 13.5, file: "earn-frame-03-logo-lockup.png" },
    { sec: 24.0, file: "earn-frame-04-earn-ui-protocols.png" },
    { sec: 35.0, file: "earn-frame-05-swap-and-earn.png" },
    { sec: 44.5, file: "earn-frame-06-deposit-modal.png" },
    { sec: 49.0, file: "earn-frame-07-live-earning-confirmed.png" },
  ];

  for (const kf of keyframes) {
    await page.evaluate((s) => window.__setVideoFrame("earn", s), kf.sec);
    const outPath = path.join(RENDERS_DIR, kf.file);
    await page.screenshot({ path: outPath, type: "png" });
    if (existsSync(ARTIFACT_DIR)) {
      copyFileSync(outPath, path.join(ARTIFACT_DIR, kf.file));
    }
  }

  console.log("3. Rendering 57-Second FLOW Earn Motion Graphics MP4 (1920x1080 @ 20fps)...");
  const earnMp4 = path.join(RENDERS_DIR, "flow-earn-explainer.mp4");
  await renderVideoRange(page, {
    startSec: 0,
    durationSec: 57,
    fps: 20,
    audioPath: AUDIO_EARN,
    outputMp4: earnMp4,
  });

  if (existsSync(ARTIFACT_DIR)) {
    copyFileSync(earnMp4, path.join(ARTIFACT_DIR, "flow-earn-explainer.mp4"));
  }
  if (existsSync(DOWNLOADS_DIR)) {
    copyFileSync(earnMp4, path.join(DOWNLOADS_DIR, "flow-earn-explainer.mp4"));
  }

  await browser.close();
  console.log("FLOW Earn MP4 render complete:", earnMp4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
