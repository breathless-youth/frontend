export function parseInitialSubject(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}
export function useInitialSubject(
  userId: number | null,
  candidate: number | undefined,
  restored: boolean,
) {
  const [checked, setChecked] = useState<{
    userId: number;
    candidate: number;
    subjectId: number | undefined;
  } | null>(null);
  const needed = !restored && userId !== null && candidate !== undefined;
  useEffect(() => {
    if (!needed || userId === null || candidate === undefined) return;
    let active = true;
    const finish = (subjectId: number | undefined) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      setChecked({ userId, candidate, subjectId });
    };
    const timer = setTimeout(() => finish(undefined), 3000);
    void listSubjects().then(
      (subjects) =>
        finish(subjects.some((subject) => subject.id === candidate) ? candidate : undefined),
      () => finish(undefined),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [needed, userId, candidate]);
  if (!needed) return { settled: true, subjectId: undefined };
  const settled = checked?.userId === userId && checked?.candidate === candidate;
  return { settled, subjectId: settled ? checked.subjectId : undefined };
}
import { useEffect, useState } from "react";
import { listSubjects } from "@/lib/subjectApi";
