import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, "audio-earn");
const SEG_DIR = path.join(AUDIO_DIR, "segments");
mkdirSync(SEG_DIR, { recursive: true });

const UVX = "/Users/user/.local/bin/uvx";
const FFMPEG = "/Users/user/.local/bin/ffmpeg";

export const EARN_NARRATION_SEGMENTS = [
  {
    id: "earn01_hook",
    startSec: 0.5,
    windowSec: 8.2,
    text: "Idle crypto shouldn't sit still. With FLOW Earn, you can put your assets to work on NEAR Protocol and earn yield directly inside your wallet.",
  },
  {
    id: "earn02_logo",
    startSec: 9.2,
    windowSec: 6.4,
    text: "Introducing FLOW Earn. Native liquid staking and DeFi yield, built into one seamless interface.",
  },
  {
    id: "earn03_ui",
    startSec: 16.2,
    windowSec: 11.4,
    text: "Open Earn directly from the navigation bar. Stake NEAR with LiNEAR Protocol at six point two six percent variable APY, or supply to Burrow Finance for up to nine point two percent APY.",
  },
  {
    id: "earn04_swap",
    startSec: 28.2,
    windowSec: 10.4,
    text: "Holding SOL on Solana or USDC on Base? Click Swap now to convert any asset into native NEAR in one step via NEAR Intents.",
  },
  {
    id: "earn05_deposit",
    startSec: 39.2,
    windowSec: 11.4,
    text: "Click Deposit, choose your amount, and preview your annual return. Confirm in one click to deploy on-chain, track your live earning balance, and withdraw anytime.",
  },
  {
    id: "earn06_outro",
    startSec: 51.2,
    windowSec: 5.5,
    text: "Swap, stake, and earn on NEAR—all in one flow.",
  },
];

function probeDuration(filePath) {
  try {
    execFileSync(FFMPEG, ["-i", filePath], { stdio: "pipe" });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) {
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
  }
  return 0;
}

async function main() {
  console.log("1. Synthesizing 6 calm Siri-like female voiceover segments (en-US-AvaNeural)...");
  const timingReport = [];

  for (const seg of EARN_NARRATION_SEGMENTS) {
    const mp3Path = path.join(SEG_DIR, `${seg.id}.mp3`);
    const wavPath = path.join(SEG_DIR, `${seg.id}.wav`);
    if (!existsSync(mp3Path)) {
      execFileSync(UVX, [
        "edge-tts",
        "--voice", "en-US-AvaNeural",
        "--rate=+0%",
        "--pitch=+0Hz",
        "--text", seg.text,
        "--write-media", mp3Path,
      ], { stdio: "ignore" });
    }

    const rawDur = probeDuration(mp3Path);
    const maxAllowed = seg.windowSec - 0.3;
    let tempo = 1.0;
    if (rawDur > maxAllowed) {
      tempo = Math.min(1.16, Number((rawDur / maxAllowed).toFixed(3)));
    }

    const af = tempo > 1.005
      ? `atempo=${tempo},highpass=f=75,acompressor=threshold=-18dB:ratio=2.0:attack=15:release=200`
      : `highpass=f=75,acompressor=threshold=-18dB:ratio=2.0:attack=15:release=200`;

    execFileSync(FFMPEG, [
      "-y",
      "-i", mp3Path,
      "-af", af,
      "-ar", "44100",
      "-ac", "2",
      wavPath,
    ], { stdio: "ignore" });

    const finalDur = probeDuration(wavPath);
    timingReport.push({
      ...seg,
      rawDur: Number(rawDur.toFixed(2)),
      finalDur: Number(finalDur.toFixed(2)),
      endSec: Number((seg.startSec + finalDur).toFixed(2)),
      tempo,
      wavPath,
    });
    console.log(
      `   - ${seg.id}: start=${seg.startSec}s, dur=${finalDur.toFixed(2)}s (window=${seg.windowSec}s, tempo=${tempo}x)`
    );
  }

  console.log("2. Mixing 57.0s master stereo soundtrack (calm female voiceover + warm ambient pad)...");
  const inputs = [
    "-f", "lavfi",
    "-i", "aevalsrc='0.012*sin(2*PI*130.81*t)+0.010*sin(2*PI*196.00*t)+0.008*sin(2*PI*246.94*t)+0.007*sin(2*PI*293.66*t):s=44100:c=stereo:d=57'",
  ];
  const filterParts = [
    `[0:a]lowpass=f=850,afade=t=in:st=0:d=1.5,afade=t=out:st=54.5:d=2.5[bed]`,
  ];

  const mixLabels = ["[bed]"];
  const N = EARN_NARRATION_SEGMENTS.length + 1;
  EARN_NARRATION_SEGMENTS.forEach((seg, idx) => {
    const wavPath = path.join(SEG_DIR, `${seg.id}.wav`);
    inputs.push("-i", wavPath);
    const inputIdx = idx + 1;
    const delayMs = Math.round(seg.startSec * 1000);
    const label = `[v${idx}]`;
    filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${(N * 0.92).toFixed(2)}${label}`);
    mixLabels.push(label);
  });

  filterParts.push(`[bed]volume=${(N * 0.45).toFixed(2)}[bedboost]`);
  mixLabels[0] = "[bedboost]";

  filterParts.push(
    `${mixLabels.join("")}amix=inputs=${N}:duration=first:dropout_transition=0,alimiter=limit=0.92[outa]`
  );

  const masterM4a = path.join(AUDIO_DIR, "flow-earn-vo.m4a");

  execFileSync(FFMPEG, [
    "-y",
    ...inputs,
    "-filter_complex", filterParts.join(";"),
    "-map", "[outa]",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", "57",
    masterM4a,
  ], { stdio: "ignore" });

  writeFileSync(
    path.join(AUDIO_DIR, "timing-report-earn.json"),
    JSON.stringify(timingReport, null, 2)
  );
  console.log("Done! Master FLOW Earn female voiceover saved to:", masterM4a);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
