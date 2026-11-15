import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
   interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface FlowExplainerProps {
  cut: "master" | "pitch90" | "promo30" | "teaser15";
}

export const SCENE_TIMELINE = [
  { id: 1, title: "The Promise of Digital Money", startSec: 0, endSec: 14, screen: "01-marketing-landing-mobile.png", theme: "sand" },
  { id: 2, title: "The Fragmentation Problem", startSec: 14, endSec: 36, screen: "17-public-guest-checkout-unsupported.png", theme: "obsidian" },
  { id: 3, title: "The Founding Question", startSec: 36, endSec: 54, screen: "01-marketing-landing.png", theme: "obsidian" },
  { id: 4, title: "Introducing FLOW — Signature Logo Reveal", startSec: 54, endSec: 78, screen: "flow-logo-white.png", theme: "crimson" },
  { id: 5, title: "A Simpler Wallet Experience", startSec: 78, endSec: 108, screen: "02-sign-in-mobile.png", theme: "sand" },
  { id: 6, title: "Your Financial Home", startSec: 108, endSec: 126, screen: "flow-final-dashboard-desktop.png", theme: "cream" },
  { id: 7, title: "Receive and Send", startSec: 126, endSec: 148, screen: "flow-final-receive-desktop.png", theme: "sand" },
  { id: 8, title: "Convert and Add Money", startSec: 148, endSec: 168, screen: "flow-final-add-money-desktop.png", theme: "cream" },
  { id: 9, title: "Payment Links", startSec: 168, endSec: 186, screen: "flow-final-payment-links-mobile.png", theme: "sand" },
  { id: 10, title: "Alice (SOL on Solana) -> Bob (USDC on Base)", startSec: 186, endSec: 214, screen: "flow-final-checkout-any-token.png", theme: "sand" },
  { id: 11, title: "The Technology Behind FLOW", startSec: 214, endSec: 236, screen: "flow-final-dashboard-desktop.png", theme: "obsidian" },
  { id: 12, title: "Security, Activity, and Flow AI", startSec: 236, endSec: 252, screen: "flow-final-ai-assistant-drawer-desktop.png", theme: "cream" },
  { id: 13, title: "Why FLOW Matters", startSec: 252, endSec: 261, screen: "01-marketing-landing.png", theme: "sand" },
  { id: 14, title: "Closing Statement — Different Chains. One Flow.", startSec: 261, endSec: 270, screen: "flow-logo-white.png", theme: "crimson" },
] as const;

export const FlowLogoRevealSequence: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const streamProgress = interpolate(frame, [0, fps * 1.4], [0, 1], { extrapolateRight: "clamp" });
  const deltaScale = spring({ frame: Math.max(0, frame - Math.round(fps * 0.6)), fps, config: { damping: 14, stiffness: 110 } });
  const crestProgress = spring({ frame: Math.max(0, frame - Math.round(fps * 1.1)), fps, config: { damping: 12, stiffness: 130 } });
  const wordmarkWidth = interpolate(frame, [fps * 1.4, fps * 2.4], [0, 460], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 55% 36%, rgba(255,26,26,0.22) 0%, #110B0B 52%, #060606 100%)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 34, transform: `scale(${deltaScale})` }}>
        <svg width="210" height="175" viewBox="0 0 220 185">
          <path
            d="M 22 142 L 76 46 C 85 30, 106 31, 114 48 L 136 92 C 140 100, 147 105, 155 110 L 194 132 C 210 141, 206 168, 184 168 L 40 168 C 20 168, 12 156, 22 142 Z"
            fill="#FFFFFF"
            opacity={streamProgress}
          />
          <path
            d="M 115 26 L 132 14 C 144 6, 159 10, 167 23 L 208 92 C 213 101, 204 109, 195 102 L 115 39 C 109 35, 109 30, 115 26 Z"
            fill="#FF1A1A"
            opacity={crestProgress}
            transform={`translate(${(1 - crestProgress) * 40}, ${-(1 - crestProgress) * 26})`}
          />
        </svg>
        <div style={{ overflow: "hidden", maxWidth: wordmarkWidth }}>
          <span style={{ fontSize: 156, fontWeight: 800, letterSpacing: "-0.045em", color: "#FFFFFF", fontFamily: "Inter, sans-serif" }}>
            flow
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const FlowExplainerComposition: React.FC<FlowExplainerProps> = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }}>
      <Audio src={staticFile("audio/flow-master-voiceover.m4a")} />
      {SCENE_TIMELINE.map((scene) => {
        const from = scene.startSec * fps;
        const durationInFrames = (scene.endSec - scene.startSec) * fps;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} name={`S${scene.id}: ${scene.title}`}>
            {scene.id === 4 || scene.id === 14 ? (
              <FlowLogoRevealSequence />
            ) : (
              <AbsoluteFill
                style={{
                  background:
                    scene.theme === "sand"
                      ? "radial-gradient(circle at 52% 42%, #F9EFE2 0%, #E7CEB0 52%, #CFA980 100%)"
                      : scene.theme === "cream"
                        ? "#FBF8F3"
                        : "#0B0B0B",
                  padding: 80,
                }}
              >
                <Img src={staticFile(`ui/${scene.screen}`)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </AbsoluteFill>
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
