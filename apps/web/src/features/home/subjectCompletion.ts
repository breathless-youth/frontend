import type { SubjectDayResponse } from "@focusmakers/types";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { completeSubject, listSubjectsOnDay, uncompleteSubject } from "@/lib/subjectApi";
import { showToast } from "@/lib/toast";

/**
 * 고른 날짜의 과목 완료 읽기·쓰기
 *
 * 홈 과목 카드의 완료 표시·취소는 모두 이 값을 거친다.
 * 날짜별 과목 조회를 받기 전이거나 받지 못했으면 null을 돌려주고, null이면 완료 버튼과 오른쪽 스와이프가 보이지 않는다.
 * 이 API가 아직 없는 서버에서도 홈이 깨지지 않고 완료 기능만 숨게 하려는 것이라 조회 실패는 알리지 않는다.
 */
export interface SubjectCompletion {
  isDone: (subjectId: number) => boolean;
  setDone: (subjectId: number, done: boolean) => void;
}

const SUBJECT_COMPLETION_FAILED = "완료를 저장하지 못했어요. 다시 시도해 주세요";

/** 홈 과목 목록도 지난 날에 그날 있던 과목을 거르려고 같은 조회를 쓴다. */
export const subjectsOnDayQuery = (userId: number, dateKey: string) =>
  queryOptions({
    queryKey: ["subjects", "day", userId, dateKey],
    queryFn: () => listSubjectsOnDay(dateKey),
  });

/**
 * 완료 표시·취소는 저장이 끝날 때까지 과목별로 덮어 둔 값을 보여 주고, 실패하면 덮어 둔 값을 걷고 알린다.
 * 받아 둔 목록을 고치지 않고 따로 덮어 두는 것은, 저장 중에 끝난 재조회가 낡은 서버 값으로 화면을 되돌리지 못하게 하려는 것이다.
 * 같은 사용자·날짜·과목의 요청이 끝나기 전에 온 변경은 버린다.
 * 표시와 취소가 동시에 가면 서버에 도착하는 순서가 바뀔 수 있어서다.
 */
export function useSubjectCompletion(userId: number, dateKey: string): SubjectCompletion | null {
  const queryClient = useQueryClient();
  const query = subjectsOnDayQuery(userId, dateKey);
  const { queryKey } = query;
  const { data } = useQuery(query);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const pending = useRef(new Set<string>());

  // 재조회 중이거나 재조회가 실패해도 받아 둔 값을 보여 준다. 그때마다 숨기면 완료 버튼이 깜빡인다.
  if (data === undefined) {
    return null;
  }

  const markerOf = (subjectId: number) => `${String(userId)}:${dateKey}:${String(subjectId)}`;
  const isDone = (subjectId: number) =>
    overrides.get(markerOf(subjectId)) ??
    data.some((subject) => subject.id === subjectId && subject.completed);
  const override = (marker: string, done: boolean | null) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (done === null) {
        next.delete(marker);
      } else {
        next.set(marker, done);
      }
      return next;
    });
  };

  const setDone = async (subjectId: number, done: boolean) => {
    const marker = markerOf(subjectId);
    if (pending.current.has(marker) || isDone(subjectId) === done) {
      return;
    }
    pending.current.add(marker);
    override(marker, done);
    try {
      await (done ? completeSubject : uncompleteSubject)(subjectId, dateKey);
      queryClient.setQueryData<SubjectDayResponse[]>(queryKey, (prev) =>
        prev?.map((subject) =>
          subject.id === subjectId
            ? { ...subject, completed: done, completedAt: done ? new Date().toISOString() : null }
            : subject,
        ),
      );
      // 받아 둔 뒤에 만든 과목은 목록에 없어서, 다시 받은 뒤에 덮어 둔 값을 걷어야 표시가 깜빡이지 않는다.
      await queryClient.invalidateQueries({ queryKey });
      // 다시 받기가 실패해 목록에 아직 없으면 저장된 값을 덮어 둔 채로 둔다.
      const listed = queryClient
        .getQueryData<SubjectDayResponse[]>(queryKey)
        ?.some((subject) => subject.id === subjectId);
      if (listed === true) {
        override(marker, null);
      }
    } catch {
      showToast(SUBJECT_COMPLETION_FAILED);
      override(marker, null);
    } finally {
      pending.current.delete(marker);
    }
  };

  return {
    isDone,
    setDone: (subjectId, done) => void setDone(subjectId, done),
  };
}
