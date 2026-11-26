import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

type OgFontSpec = {
  readonly name: string;
  readonly data: ArrayBuffer;
  readonly weight: 400 | 500 | 600 | 700;
  readonly style: "normal";
};

let cachedDarkLogoDataUri: string | null | undefined;
let cachedWhiteLogoDataUri: string | null | undefined;
let cachedFonts: OgFontSpec[] | undefined;

function readLogoDataUri(filename: string): string | null {
  try {
    const filePath = path.join(process.cwd(), "public", "assets", filename);
    const bytes = readFileSync(filePath);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function getDarkLogoDataUri(): string | null {
  if (cachedDarkLogoDataUri === undefined) {
    cachedDarkLogoDataUri = readLogoDataUri("flow-logo.png");
  }
  return cachedDarkLogoDataUri;
}

function getWhiteLogoDataUri(): string | null {
  if (cachedWhiteLogoDataUri === undefined) {
    cachedWhiteLogoDataUri = readLogoDataUri("flow-logo-white.png");
  }
  return cachedWhiteLogoDataUri;
}

function readFontArrayBuffer(filename: string): ArrayBuffer | null {
  try {
    const filePath = path.join(process.cwd(), "public", "fonts", filename);
    const buf = readFileSync(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

function getOgFonts(): OgFontSpec[] {
  if (cachedFonts !== undefined) {
    return cachedFonts;
  }
  const defs: Array<{
    file: string;
    name: string;
    weight: 400 | 500 | 600 | 700;
  }> = [
    { file: "Inter-Regular.ttf", name: "Inter", weight: 400 },
    { file: "Inter-SemiBold.ttf", name: "Inter", weight: 600 },
    { file: "Inter-Bold.ttf", name: "Inter", weight: 700 },
    { file: "PlayfairDisplay-Medium.ttf", name: "Playfair Display", weight: 500 },
    { file: "PlayfairDisplay-Bold.ttf", name: "Playfair Display", weight: 700 },
  ];
  const loaded: OgFontSpec[] = [];
  for (const def of defs) {
    const data = readFontArrayBuffer(def.file);
    if (data) {
      loaded.push({
        name: def.name,
        data,
        weight: def.weight,
        style: "normal",
      });
    }
  }
  cachedFonts = loaded;
  return loaded;
}

export function formatOgNetworkName(network: string | null | undefined): string {
  const norm = (network ?? "").toLowerCase().trim();
  if (norm.startsWith("near")) {
    return norm.includes("testnet") ? "NEAR Testnet" : "NEAR Mainnet";
  }
  if (norm.startsWith("solana")) {
    return norm.includes("devnet") ? "Solana Devnet" : "Solana Mainnet";
  }
  if (norm.startsWith("base")) {
    return norm.includes("sepolia") ? "Base Sepolia" : "Base Mainnet";
  }
  if (norm.startsWith("ethereum")) {
    return norm.includes("sepolia") ? "Ethereum Sepolia" : "Ethereum Mainnet";
  }
  return network || "NEAR Mainnet";
}

function formatOgAmount(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return "";
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return raw;
  if (parsed === 0) return "0";
  const maxDecimals = parsed > 0 && parsed < 0.01 ? 6 : 4;
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const [intPart, fracPart = ""] = cleaned.split(".");
    if (!fracPart) return intPart || "0";
    const truncated = fracPart.slice(0, maxDecimals).replace(/0+$/, "");
    return truncated ? `${intPart || "0"}.${truncated}` : intPart || "0";
  }
  return parsed.toFixed(maxDecimals).replace(/\.?0+$/, "");
}

function truncateText(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

function ogHeaders(): Record<string, string> {
  return {
    "Content-Type": "image/png",
    "Cache-Control":
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  };
}

function FlowTopRightWave() {
  return (
    <svg
      width="420"
      height="170"
      viewBox="0 0 500 200"
      fill="none"
      style={{
        position: "absolute",
        top: "-18px",
        right: "0px",
      }}
    >
      <defs>
        <linearGradient id="flowOgWave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF2E2E" />
          <stop offset="65%" stopColor="#CC0000" />
          <stop offset="100%" stopColor="#1A0000" />
        </linearGradient>
      </defs>
      <path
        d="M120 -20 C240 80, 360 20, 520 150 L520 -20 Z"
        fill="url(#flowOgWave)"
      />
    </svg>
  );
}

export function renderDirectFlowOgImage(input: {
  readonly flowId: string;
  readonly accountName?: string | null;
}): ImageResponse {
  const logoUri = getDarkLogoDataUri();
  const fonts = getOgFonts();
  const displayName = truncateText(
    (input.accountName ?? "").trim() || input.flowId,
    28,
  );
  const firstName = truncateText(
    (input.accountName ?? "").trim().split(/\s+/)[0] ||
      input.flowId.replace(/@flow$/i, ""),
    18,
  );
  const showHandleSub =
    Boolean(input.accountName?.trim()) &&
    input.accountName!.trim().toLowerCase() !== input.flowId.toLowerCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 90% 8%, rgba(255, 26, 26, 0.08) 0%, rgba(250, 248, 245, 0) 45%), linear-gradient(145deg, #FAF8F5 0%, #F4EFE7 100%)",
          padding: "40px 64px 44px 64px",
          position: "relative",
          fontFamily: "Inter",
        }}
      >
        <FlowTopRightWave />

        {/* Top Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {logoUri ? (
              <img
                src={logoUri}
                alt="FLOW"
                width={114}
                height={38}
                style={{ width: "114px", height: "38px" }}
              />
            ) : (
              <div
                style={{
                  fontSize: "30px",
                  fontWeight: 700,
                  color: "#0B0B0B",
                  display: "flex",
                }}
              >
                flow
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: "17px",
              fontWeight: 600,
              color: "#525252",
              marginRight: "170px",
              display: "flex",
            }}
          >
            flow.devhub.forum
          </div>
        </div>

        {/* Horizontal Mobile Frame with Receipt Card Inside */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            flex: 1,
            marginTop: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "1040px",
              height: "442px",
              borderRadius: "44px",
              background: "#121215",
              border: "3px solid #2A2A30",
              padding: "18px 22px 18px 18px",
              boxShadow: "0 24px 60px rgba(11, 11, 13, 0.18)",
            }}
          >
            {/* Left Phone Speaker Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "26px",
                height: "100%",
                marginRight: "14px",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "84px",
                  borderRadius: "999px",
                  background: "#2C2C33",
                  display: "flex",
                }}
              />
            </div>

            {/* Crisp White Flow Receipt Inside Phone Screen */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                flex: 1,
                height: "100%",
                borderRadius: "28px",
                background: "#FFFFFF",
                padding: "36px 46px",
              }}
            >
              {/* Receipt Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      width: "9px",
                      height: "9px",
                      borderRadius: "999px",
                      background: "#FF1A1A",
                      display: "flex",
                    }}
                  />
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#FF1A1A",
                      letterSpacing: "0.14em",
                      display: "flex",
                    }}
                  >
                    FLOW PAYMENT RECEIPT
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#737373",
                    display: "flex",
                  }}
                >
                  Settles on NEAR
                </div>
              </div>

              {/* Recipient Identity */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    fontFamily: "Playfair Display",
                    fontSize: "56px",
                    fontWeight: 700,
                    color: "#0B0B0B",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.08,
                    display: "flex",
                  }}
                >
                  {displayName}
                </div>
                {showHandleSub && (
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: 600,
                      color: "#525252",
                      display: "flex",
                    }}
                  >
                    {truncateText(input.flowId, 38)}
                  </div>
                )}
              </div>

              {/* Dashed Receipt Tear Line */}
              <div
                style={{
                  width: "100%",
                  borderTop: "2px dashed #E5E5E5",
                  display: "flex",
                }}
              />

              {/* Action Row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#111114",
                    color: "#FFFFFF",
                    borderRadius: "999px",
                    padding: "16px 34px",
                    fontSize: "21px",
                    fontWeight: 700,
                  }}
                >
                  {`Pay ${firstName} with FLOW`}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "3px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "19px",
                      fontWeight: 600,
                      color: "#262626",
                      display: "flex",
                    }}
                  >
                    Or pay with external wallet
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 400,
                      color: "#737373",
                      display: "flex",
                    }}
                  >
                    USDC · USDT · SOL · ETH · NEAR · Any token
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      fonts,
      headers: ogHeaders(),
    },
  );
}

export function renderCheckoutOgImage(input: {
  readonly title: string;
  readonly recipientName: string;
  readonly amountMode: "FIXED" | "OPTIONAL";
  readonly displayAmount: string | null;
  readonly destinationAssetSymbol: string;
  readonly destinationNetwork: string;
}): ImageResponse {
  const logoUri = getDarkLogoDataUri();
  const fonts = getOgFonts();
  const networkLabel = formatOgNetworkName(input.destinationNetwork);
  const formattedAmt = formatOgAmount(input.displayAmount);
  const isFixed = input.amountMode === "FIXED" && Boolean(formattedAmt);
  const cleanTitle = truncateText(input.title || "Payment Request", 38);
  const cleanRecipient = truncateText(
    input.recipientName || "FLOW Recipient",
    32,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 90% 8%, rgba(255, 26, 26, 0.08) 0%, rgba(250, 248, 245, 0) 45%), linear-gradient(145deg, #FAF8F5 0%, #F4EFE7 100%)",
          padding: "42px 64px 48px 64px",
          position: "relative",
          fontFamily: "Inter",
        }}
      >
        <FlowTopRightWave />

        {/* Header Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {logoUri ? (
              <img
                src={logoUri}
                alt="FLOW"
                width={114}
                height={38}
                style={{ width: "114px", height: "38px" }}
              />
            ) : (
              <div
                style={{
                  fontSize: "30px",
                  fontWeight: 700,
                  color: "#0B0B0B",
                  display: "flex",
                }}
              >
                flow
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "#FF1A1A",
              letterSpacing: "0.14em",
              marginRight: "175px",
              display: "flex",
            }}
          >
            FLOW CHECKOUT
          </div>
        </div>

        {/* Main Checkout Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "1072px",
            height: "438px",
            borderRadius: "34px",
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
            padding: "44px 54px",
            boxShadow: "0 20px 50px rgba(11, 11, 13, 0.08)",
          }}
        >
          {/* Top Section: Amount or Open Payment Title */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "#737373",
                letterSpacing: "0.12em",
                display: "flex",
              }}
            >
              {isFixed ? "AMOUNT DUE" : "PAYMENT REQUEST"}
            </div>

            {isFixed ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "68px",
                      fontWeight: 700,
                      color: "#0B0B0B",
                      letterSpacing: "-0.03em",
                      lineHeight: 1.04,
                      display: "flex",
                    }}
                  >
                    {`${formattedAmt} ${input.destinationAssetSymbol}`}
                  </div>
                  <div
                    style={{
                      fontSize: "25px",
                      fontWeight: 600,
                      color: "#6B6B6B",
                      display: "flex",
                    }}
                  >
                    {`on ${networkLabel}`}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "Playfair Display",
                    fontSize: "30px",
                    fontWeight: 500,
                    color: "#3F3F46",
                    display: "flex",
                  }}
                >
                  {cleanTitle}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    fontFamily: "Playfair Display",
                    fontSize: "60px",
                    fontWeight: 700,
                    color: "#0B0B0B",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.08,
                    display: "flex",
                  }}
                >
                  {cleanTitle}
                </div>
                <div
                  style={{
                    fontSize: "23px",
                    fontWeight: 600,
                    color: "#525252",
                    display: "flex",
                  }}
                >
                  {`Any amount · Settles in ${input.destinationAssetSymbol} on ${networkLabel}`}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            style={{
              width: "100%",
              borderTop: "1px solid #EBEBEB",
              display: "flex",
            }}
          />

          {/* Bottom Row: Recipient + CTA */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#737373",
                  display: "flex",
                }}
              >
                Recipient
              </div>
              <div
                style={{
                  fontSize: "25px",
                  fontWeight: 700,
                  color: "#0B0B0B",
                  display: "flex",
                }}
              >
                {cleanRecipient}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "22px",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#6B6B6B",
                  display: "flex",
                }}
              >
                Pay with stablecoins or any token
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#111114",
                  color: "#FFFFFF",
                  borderRadius: "999px",
                  padding: "16px 38px",
                  fontSize: "20px",
                  fontWeight: 700,
                }}
              >
                Pay Now
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      fonts,
      headers: ogHeaders(),
    },
  );
}

export function renderSiteOgImage(): ImageResponse {
  const logoUri = getWhiteLogoDataUri();
  const fonts = getOgFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 92% 6%, rgba(255, 26, 26, 0.32) 0%, rgba(11, 11, 13, 0) 48%), linear-gradient(145deg, #0B0B0D 0%, #151519 100%)",
          padding: "56px 72px",
          position: "relative",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {logoUri ? (
            <img
              src={logoUri}
              alt="FLOW"
              width={138}
              height={46}
              style={{ width: "138px", height: "46px" }}
            />
          ) : (
            <div
              style={{
                fontSize: "36px",
                fontWeight: 700,
                color: "#FFFFFF",
                display: "flex",
              }}
            >
              flow
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "980px",
          }}
        >
          <div
            style={{
              fontFamily: "Playfair Display",
              fontSize: "66px",
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              lineHeight: 1.06,
              display: "flex",
            }}
          >
            Multi-chain money without the friction wall.
          </div>
          <div
            style={{
              fontSize: "25px",
              fontWeight: 400,
              color: "#A3A3A3",
              lineHeight: 1.4,
              display: "flex",
            }}
          >
            Send, receive, convert, and get paid across NEAR, Solana, Base, and Ethereum.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: "24px",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#D4D4D4",
              display: "flex",
            }}
          >
            Non-custodial wallets · @flow IDs · Universal Checkout
          </div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#FF3B3B",
              display: "flex",
            }}
          >
            flow.devhub.forum
          </div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      fonts,
      headers: ogHeaders(),
    },
  );
}
