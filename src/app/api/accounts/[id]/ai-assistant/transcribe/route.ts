import { runtime as appRuntime } from "../../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../../server/accounts.ts";
import { clientBudget } from "../../../../../../server/auth/limits.ts";
import {
  ApiFailure,
  api,
  canonicalHost,
  reply,
} from "../../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

function resolveAudioFilename(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("mp4") || lower.includes("m4a")) return "voice-note.m4a";
  if (lower.includes("ogg")) return "voice-note.ogg";
  if (lower.includes("wav")) return "voice-note.wav";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "voice-note.mp3";
  return "voice-note.webm";
}

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db, auth } = appRuntime();
    canonicalHost(request.headers, auth);
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("origin") !== auth.origin ||
      (site && site !== "same-origin")
    ) {
      throw new ApiFailure(403, "INVALID_ORIGIN");
    }

    const actor = await principal(db, request.headers);
    await access(db, actor, id);

    const allowed = await clientBudget(request, "ai:voice-transcribe");
    if (!allowed) {
      throw new ApiFailure(429, "RATE_LIMIT_EXCEEDED");
    }

    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!groqKey) {
      throw new ApiFailure(503, "VOICE_TRANSCRIPTION_UNAVAILABLE");
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new ApiFailure(400, "INVALID_AUDIO_FORM");
    }
    const audio = formData.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      throw new ApiFailure(400, "AUDIO_REQUIRED");
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new ApiFailure(413, "AUDIO_TOO_LARGE");
    }

    const mimeType = audio.type || "audio/webm";
    const filename = resolveAudioFilename(mimeType);
    const groqForm = new FormData();
    groqForm.append("file", new File([audio], filename, { type: mimeType }));
    groqForm.append(
      "model",
      process.env.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3-turbo",
    );
    groqForm.append("response_format", "json");
    groqForm.append("temperature", "0");

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: groqForm,
      },
    );

    if (groqRes.status === 429) {
      await groqRes.body?.cancel().catch(() => {});
      throw new ApiFailure(429, "VOICE_RATE_LIMITED");
    }

    if (!groqRes.ok) {
      await groqRes.body?.cancel().catch(() => {});
      throw new ApiFailure(502, "VOICE_TRANSCRIPTION_FAILED");
    }

    const payload = (await groqRes.json()) as { text?: string };
    const text = (payload.text ?? "").trim();
    if (!text) {
      throw new ApiFailure(422, "NO_SPEECH_DETECTED");
    }

    return reply(200, { ok: true, text });
  });
}
