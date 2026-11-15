import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, "audio-3min");
const SEG_DIR = path.join(AUDIO_DIR, "segments-v2");
mkdirSync(SEG_DIR, { recursive: true });

const UVX = "/Users/user/.local/bin/uvx";
const FFMPEG = "/Users/user/.local/bin/ffmpeg";

// 12 timed narration segments across the 180-second (3:00) film.
// Paced so every segment plays at calm, natural 1.0x Siri-like cadence with zero overlap.
export const NARRATION_SEGMENTS = [
  {
    id: "seg01_hook",
    startSec: 0.6,
    windowSec: 11.2,
    text: "Moving money online should feel effortless. Yet in crypto, holding SOL on Solana while someone else wants NEAR still feels disconnected. What if it didn't have to be?",
  },
  {
    id: "seg02_logo",
    startSec: 12.2,
    windowSec: 9.5,
    text: "Meet FLOW. The multi-chain wallet and payment platform where you pay with what you hold, and receive what you want.",
  },
  {
    id: "seg03_onboarding",
    startSec: 22.2,
    windowSec: 21.4,
    text: "Getting started takes seconds. Continue with Google on the first screen, or click Sign in to use an email code. FLOW sets up your wallet automatically with your Google name and profile photo. One clean loading bar coordinates OutLayer provisioning and NEAR policy sponsorship across Solana, NEAR, Ethereum, and Base.",
  },
  {
    id: "seg04_dashboard",
    startSec: 44.2,
    windowSec: 21.4,
    text: "Your wallet dashboard brings your multi-chain balances together in one unified view. Track your total portfolio value alongside your assets across NEAR, Solana, Base, and Ethereum—and jump straight into adding funds, sending transfers, or requesting payments anytime.",
  },
  {
    id: "seg05_receive",
    startSec: 66.2,
    windowSec: 15.4,
    text: "In Direct Receive, pick any asset from the dropdown—like SOL—and FLOW checks the Solana network to populate only the assets supported on Solana below. Switch to NEAR, and it dynamically populates NEAR's supported assets.",
  },
  {
    id: "seg06_convert",
    startSec: 82.2,
    windowSec: 13.4,
    text: "In Convert, swap between assets like SOL on Solana and NEAR. Starting cleanly from zero, live quotes update immediately as you type—without waiting to click review first.",
  },
  {
    id: "seg07_midtext",
    startSec: 96.2,
    windowSec: 5.5,
    text: "And for getting paid across chains, FLOW introduces Payment Links.",
  },
  {
    id: "seg08_request",
    startSec: 102.2,
    windowSec: 19.4,
    text: "Open Request Payment to get paid on your terms. Suppose you want to receive one hundred and fifty NEAR on NEAR Protocol. Select NEAR as your destination asset, enter the amount, and create a shareable payment link in one click.",
  },
  {
    id: "seg09_checkout_select",
    startSec: 122.2,
    windowSec: 15.4,
    text: "Your sender opens that link in any browser—no FLOW account needed. Even though you requested NEAR, they hold SOL on Solana. They open the asset selector with over two hundred tokens across thirty-nine chains, and choose SOL on Solana.",
  },
  {
    id: "seg10_checkout_settle",
    startSec: 138.2,
    windowSec: 13.4,
    text: "FLOW fetches a live One Click quote and issues a Solana deposit address. Once they send SOL, FLOW routes the payment and settles one hundred and fifty NEAR directly into your wallet.",
  },
  {
    id: "seg11_activity_ai",
    startSec: 152.2,
    windowSec: 19.4,
    text: "Every transfer, conversion, and settled payment link is tracked and verified on-chain inside Activity—giving you clear transaction history at a glance. And whenever you need answers, Flow A I gives you an account-aware assistant right inside your wallet to check balances and confirm settlements.",
  },
  {
    id: "seg12_outro",
    startSec: 172.2,
    windowSec: 7.5,
    text: "Pay with what you hold. Receive what you want. Solana, NEAR, Ethereum, and Base—all in one flow.",
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
  console.log("1. Synthesizing 12 calm Siri-like female voiceover segments (en-US-AvaNeural)...");
  const timingReport = [];

  for (const seg of NARRATION_SEGMENTS) {
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

    const dur = probeDuration(mp3Path);
    let tempo = 1.0;
    const maxAllowed = seg.windowSec - 0.4;
    if (dur > maxAllowed) {
      tempo = Math.min(1.12, Number((dur / maxAllowed).toFixed(3)));
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
      id: seg.id,
      startSec: seg.startSec,
      windowSec: seg.windowSec,
      rawDur: Number(dur.toFixed(2)),
      tempo,
      finalDur: Number(finalDur.toFixed(2)),
      endSec: Number((seg.startSec + finalDur).toFixed(2)),
    });
    console.log(`  - ${seg.id}: start=${seg.startSec}s, dur=${finalDur.toFixed(2)}s / window=${seg.windowSec}s (tempo=${tempo}x)`);
  }

  writeFileSync(path.join(AUDIO_DIR, "timing-report.json"), JSON.stringify(timingReport, null, 2));

  const fullCleanText = NARRATION_SEGMENTS.map((s) => s.text).join("\n\n");
  writeFileSync(path.join(__dirname, "voiceover-script-clean.txt"), fullCleanText + "\n");

  console.log("2. Mixing 180.0s master stereo soundtrack (calm female voiceover + warm ambient pad)...");
  const inputs = [
    "-f", "lavfi",
    "-i", "aevalsrc='0.012*sin(2*PI*130.81*t)+0.010*sin(2*PI*196.00*t)+0.008*sin(2*PI*246.94*t)+0.007*sin(2*PI*293.66*t):s=44100:c=stereo:d=180'",
  ];
  const filterParts = [
    `[0:a]lowpass=f=850,afade=t=in:st=0:d=2.0,afade=t=out:st=176.5:d=3.5[bed]`,
  ];

  // Note: amix divides volume by number of active inputs unless weights or volume compensation is applied!
  // Instead of amix across 13 inputs (which divides volume by 13!), we concatenate the non-overlapping voice segments on one voice timeline or use amix=normalize=0!
  // Let's check if ffmpeg 4.4 supports volume compensation: amix with 13 inputs scales by 1/13, so multiplying by 13 (or chaining adelay + amix with volume=13) restores full 0dB loudness!
  const mixLabels = ["[bed]"];
  const N = NARRATION_SEGMENTS.length + 1;
  NARRATION_SEGMENTS.forEach((seg, idx) => {
    const wavPath = path.join(SEG_DIR, `${seg.id}.wav`);
    inputs.push("-i", wavPath);
    const inputIdx = idx + 1;
    const delayMs = Math.round(seg.startSec * 1000);
    const label = `[v${idx}]`;
    filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${(N * 0.92).toFixed(2)}${label}`);
    mixLabels.push(label);
  });

  filterParts.push(
    `[bed]volume=${(N * 0.45).toFixed(2)}[bedboost]`,
  );
  mixLabels[0] = "[bedboost]";

  filterParts.push(
    `${mixLabels.join("")}amix=inputs=${N}:duration=first:dropout_transition=0,alimiter=limit=0.92[outa]`
  );

  const masterM4a = path.join(AUDIO_DIR, "flow-3min-female-vo.m4a");
  const legacyMasterM4a = path.join(__dirname, "audio", "flow-master-voiceover.m4a");

  execFileSync(FFMPEG, [
    "-y",
    ...inputs,
    "-filter_complex", filterParts.join(";"),
    "-map", "[outa]",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", "180",
    masterM4a,
  ], { stdio: "ignore" });

  if (existsSync(path.join(__dirname, "audio"))) {
    execFileSync("cp", [masterM4a, legacyMasterM4a]);
  }

  console.log("Done! Master 3:00 female voiceover saved to:", masterM4a);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
