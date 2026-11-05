import { onlineManager } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";

import { lazyWithPreload } from "@/lib/lazyWithPreload";

const { LazySheet } = lazyWithPreload(() =>
  import("./GroupNotificationSheet").then((module) => module.GroupNotificationSheet),
);

// Keep a session fallback only when persistence fails; normal answers live in localStorage.
const unpersistedAnswers = new Set<string>();
const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

export function GroupNotificationPrompt({
  userId,
  groupId,
  ready,
  notifyEnabled,
  onAccept,
}: {
  userId: number;
  groupId: number;
  ready: boolean;
  notifyEnabled: boolean;
  onAccept: () => void;
}) {
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const checked = useRef(false);
  const [open, setOpen] = useState(false);
  const askOnce = useEffectEvent(() => {
    if (checked.current) return;
    checked.current = true;
    if (notifyEnabled) return;
    const key = `group-notification-asked:${userId}:${groupId}`;
    if (unpersistedAnswers.has(key)) return;
    try {
      if (localStorage.getItem(key) === "1") return;
    } catch {
      // A blocked read must not prevent the prompt from rendering.
      unpersistedAnswers.add(key);
    }
    try {
      localStorage.setItem(key, "1");
    } catch {
      unpersistedAnswers.add(key);
    }
    setOpen(true);
  });

  useEffect(() => {
    if (!ready || !online) return;
    if (notifyEnabled) {
      checked.current = true;
      return;
    }
    // Open after the home commits, and cancel if it leaves or goes offline first.
    const timer = window.setTimeout(() => askOnce(), 0);
    return () => window.clearTimeout(timer);
  }, [ready, online, notifyEnabled]);

  return (
    <LazySheet
      open={open}
      onOpenChange={setOpen}
      onAccept={() => {
        setOpen(false);
        onAccept();
      }}
    />
  );
}
