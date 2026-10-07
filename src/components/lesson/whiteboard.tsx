"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, getSnapshot, loadSnapshot, type Editor, type TLRecord } from "tldraw";
import "tldraw/tldraw.css";
import { openRoomChannel, type RoomChannel } from "@/lib/realtime/channel";
import { useTheme } from "@/components/theme";

type Message =
  | { type: "diff"; put: TLRecord[]; remove: string[] }
  | { type: "request-sync" }
  | { type: "snapshot"; snapshot: ReturnType<typeof getSnapshot> };

/**
 * Shared whiteboard (tldraw) synced through a realtime channel.
 *
 * Sync model, deliberately simple:
 *  - local edits are batched every 100ms and broadcast as "put these records / remove these ids"
 *  - remote edits are applied with store.mergeRemoteChanges so they aren't echoed back
 *  - a newcomer asks for a snapshot and the other side replies with the full board
 * Concurrent edits to the *same* shape resolve last-write-wins (fine for a teaching board).
 */
export default function Whiteboard({ room }: { room: string }) {
  const { theme } = useTheme();
  const editorRef = useRef<Editor | null>(null);
  const channelRef = useRef<RoomChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [mountedEditor, setMountedEditor] = useState<Editor | null>(null);

  useEffect(() => {
    const editor = mountedEditor;
    if (!editor) return;

    const pendingPut = new Map<string, TLRecord>();
    const pendingRemove = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      if (!pendingPut.size && !pendingRemove.size) return;
      channelRef.current?.send({ type: "diff", put: [...pendingPut.values()], remove: [...pendingRemove] } satisfies Message);
      pendingPut.clear();
      pendingRemove.clear();
    };

    // local -> remote
    const stopListening = editor.store.listen(
      ({ changes }) => {
        for (const rec of Object.values(changes.added)) { pendingPut.set(rec.id, rec); pendingRemove.delete(rec.id); }
        for (const [, to] of Object.values(changes.updated)) { pendingPut.set(to.id, to); }
        for (const rec of Object.values(changes.removed)) { pendingRemove.add(rec.id); pendingPut.delete(rec.id); }
        timer ??= setTimeout(flush, 100);
      },
      { source: "user", scope: "document" },
    );

    // remote -> local
    const channel = openRoomChannel(
      room,
      (raw) => {
        const msg = raw as Message;
        if (msg.type === "diff") {
          editor.store.mergeRemoteChanges(() => {
            if (msg.put.length) editor.store.put(msg.put);
            if (msg.remove.length) editor.store.remove(msg.remove as never[]);
          });
        } else if (msg.type === "request-sync") {
          channel.send({ type: "snapshot", snapshot: getSnapshot(editor.store) } satisfies Message);
        } else if (msg.type === "snapshot") {
          // Only adopt the other board if ours is still empty (we just joined)
          if (editor.getCurrentPageShapeIds().size === 0) loadSnapshot(editor.store, { document: msg.snapshot.document });
        }
      },
      (ok) => {
        setConnected(ok);
        if (ok) channel.send({ type: "request-sync" } satisfies Message);
      },
    );
    channelRef.current = channel;

    return () => {
      stopListening();
      if (timer) clearTimeout(timer);
      channel.close();
      channelRef.current = null;
    };
  }, [mountedEditor, room]);

  // Follow the app's light/dark theme
  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({ colorScheme: theme });
  }, [theme, mountedEditor]);

  return (
    <div className="relative size-full">
      <Tldraw
        onMount={(editor) => {
          editorRef.current = editor;
          editor.user.updateUserPreferences({ colorScheme: theme });
          setMountedEditor(editor);
        }}
      />
      <span
        role="status"
        className={`pointer-events-none absolute left-2 top-2 z-[300] rounded-full px-2.5 py-1 text-xs font-bold ${connected ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
      >
        {connected ? "● Live" : "○ Connecting…"}
      </span>
    </div>
  );
}
