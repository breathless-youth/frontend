export function parseInitialSubject(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}
export function useInitialSubject(
  userId: number | null,
  candidate: number | undefined,
  restored: boolean,
  prevalidated = false,
) {
  const [checked, setChecked] = useState<{
    userId: number;
    candidate: number;
    subjectId: number | undefined;
    error: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needed = !restored && !prevalidated && userId !== null && candidate !== undefined;
  useEffect(() => {
    if (!needed || userId === null || candidate === undefined) return;
    let active = true;
    const controller = new AbortController();
    const finish = (subjectId: number | undefined, error = false) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      controller.abort();
      setChecked({ userId, candidate, subjectId, error });
    };
    const timer = setTimeout(() => finish(undefined, true), 3000);
    void listSubjects({ signal: controller.signal }).then(
      (subjects) =>
        finish(subjects.some((subject) => subject.id === candidate) ? candidate : undefined),
      () => finish(undefined, true),
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [needed, userId, candidate, attempt]);
  const current =
    needed && checked?.userId === userId && checked?.candidate === candidate ? checked : null;
  const retry = () => {
    setChecked(null);
    setAttempt((value) => value + 1);
  };
  return {
    settled: !needed || (current !== null && !current.error),
    error: current?.error ?? false,
    subjectId:
      !restored && prevalidated
        ? candidate
        : current && !current.error
          ? current.subjectId
          : undefined,
    retry,
  };
}
import { useEffect, useState } from "react";
import { listSubjects } from "@/lib/subjectApi";
import { getTokenSource } from "@/lib/auth/tokenSource";

/** 좌석을 예약하기 전에 같은 계정의 과목인지 확인한다. */
export async function verifySubjectBeforeSeat(userId: number, candidate: number): Promise<boolean> {
  const source = getTokenSource();
  const controller = new AbortController();
  const unsubscribe = source?.subscribe((snapshot) => {
    if (snapshot.userId !== userId) controller.abort();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (source !== null && source.getUserId() !== userId) throw new Error("account changed");
    const subjects = await Promise.race([
      listSubjects({ signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("subject lookup timed out"));
        }, 3000);
      }),
    ]);
    if (
      controller.signal.aborted ||
      getTokenSource() !== source ||
      (source !== null && source.getUserId() !== userId)
    )
      throw new Error("account changed");
    return subjects.some((subject) => subject.id === candidate);
  } finally {
    clearTimeout(timer);
    unsubscribe?.();
    controller.abort();
  }
}
