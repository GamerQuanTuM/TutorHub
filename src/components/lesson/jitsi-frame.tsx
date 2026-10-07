"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Minimal typing for the bits of the Jitsi IFrame API we use. */
interface JitsiApi {
  dispose(): void;
  addListener(event: string, fn: () => void): void;
}
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

function loadScript(scriptUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[data-jitsi="${scriptUrl}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Could not load the video service.")));
    if (!existing) {
      script.src = scriptUrl;
      script.async = true;
      script.dataset.jitsi = scriptUrl;
      document.head.appendChild(script);
    }
  });
}

/** What the server decided (src/lib/video-provider.ts): which Jitsi, the room, and a signed token when the provider uses one. */
export interface VideoSettings { domain: string; scriptUrl: string; roomName: string; jwt?: string; error?: string }

/**
 * Jitsi Meet embedded with the IFrame API. Which Jitsi (meet.jit.si, your own server or 8x8 JaaS) is chosen on the
 * server with VIDEO_PROVIDER, so switching is a config change only.
 */
export default function JitsiFrame({
  video, displayName, recordingEnabled, chatButton = true, onLeave,
}: {
  video: VideoSettings; displayName: string; recordingEnabled: boolean;
  /** Show Jitsi's own (unsaved) chat button. Turned off when the room has TutorHub's saved chat instead. */
  chatButton?: boolean; onLeave?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { domain, scriptUrl, roomName, jwt, error } = video;
  const [state, setState] = useState<"loading" | "ready" | "error">(error ? "error" : "loading");

  useEffect(() => {
    if (error) return;
    let api: JitsiApi | undefined;
    let cancelled = false;
    loadScript(scriptUrl)
      .then(() => {
        if (cancelled || !host.current || !window.JitsiMeetExternalAPI) return;
        const toolbar = ["microphone", "camera", "desktop", ...(chatButton ? ["chat"] : []), "raisehand", "tileview", "fullscreen", "hangup", "settings"];
        if (recordingEnabled) toolbar.push("recording"); // Pro plan only
        api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          ...(jwt ? { jwt } : {}),
          parentNode: host.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName },
          configOverwrite: { prejoinPageEnabled: false, startWithAudioMuted: false, disableDeepLinking: true, toolbarButtons: toolbar },
          interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false, MOBILE_APP_PROMO: false },
        });
        api.addListener("videoConferenceLeft", () => onLeave?.());
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => { cancelled = true; api?.dispose(); };
  }, [error, domain, scriptUrl, roomName, jwt, displayName, recordingEnabled, chatButton, onLeave]);

  return (
    <div className="relative size-full min-h-[200px] overflow-hidden rounded-xl bg-ink">
      <div ref={host} className="size-full" />
      {state === "loading" && (
        <div role="status" className="absolute inset-0 grid place-items-center text-brand-100"><span className="flex items-center gap-2"><Loader2 className="size-5 animate-spin" aria-hidden /> Starting video…</span></div>
      )}
      {state === "error" && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-brand-100">
          <p>{error ?? `We couldn't load the video service (${domain}). Check your connection and reload the page.`}</p>
        </div>
      )}
    </div>
  );
}
