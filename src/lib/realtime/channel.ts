"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Browser-side realtime channel for the whiteboard: Supabase Realtime *broadcast* (no database writes).
 * The channel name contains the unguessable room name, which the server only reveals to the
 * booking's tutor and student during the join window.
 */
export interface RoomChannel {
  send(message: unknown): void;
  close(): void;
}

export function openRoomChannel(room: string, onMessage: (message: unknown) => void, onStatus?: (connected: boolean) => void): RoomChannel {
  const supabase = supabaseBrowser();
  const channel = supabase.channel(`whiteboard:${room}`, { config: { broadcast: { self: false } } });
  channel
    .on("broadcast", { event: "msg" }, ({ payload }) => onMessage(payload))
    .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
  return {
    send: (message) => { void channel.send({ type: "broadcast", event: "msg", payload: message }); },
    close: () => { void supabase.removeChannel(channel); },
  };
}
