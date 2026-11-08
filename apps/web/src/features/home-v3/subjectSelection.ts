import { useCallback, useEffect, useSyncExternalStore } from "react";

const CHANGE_EVENT = "home-v3-subject-change";
const memoryFallback = new Map<number, number | null>();
const storageKey = (userId: number) => `home-v3:subject:${userId}`;

export function readHomeSubject(userId: number): number | null {
  if (memoryFallback.has(userId)) return memoryFallback.get(userId) ?? null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === null) return null;
    const id: unknown = JSON.parse(raw);
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeHomeSubject(userId: number, subjectId: number | null): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(subjectId));
    memoryFallback.delete(userId);
  } catch {
    memoryFallback.set(userId, subjectId);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function reconcileHomeSubject(
  selectedId: number | null,
  subjects: readonly { id: number }[] | undefined,
): number | null {
  return subjects === undefined || subjects.some((subject) => subject.id === selectedId)
    ? selectedId
    : null;
}

function subscribe(notify: () => void): () => void {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function useHomeSubject(userId: number, subjects: readonly { id: number }[] | undefined) {
  const read = useCallback(() => readHomeSubject(userId), [userId]);
  const storedId = useSyncExternalStore(subscribe, read, () => null);
  const selectedId = reconcileHomeSubject(storedId, subjects);
  useEffect(() => {
    if (storedId !== selectedId) writeHomeSubject(userId, selectedId);
  }, [storedId, selectedId, userId]);
  return [selectedId, (id: number | null) => writeHomeSubject(userId, id)] as const;
}
