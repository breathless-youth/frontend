import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ManualStudySessionRequest, StudySessionResponse } from "@focusmakers/types";

import { addDaysToDateKey } from "@/features/records/recordsFormat";
import { ApiError } from "@/lib/api";
import { postToNative } from "@/lib/bridge";
import { createManualRecord, deleteManualRecord, updateManualRecord } from "@/lib/manualRecordApi";
import { statsKeys } from "@/lib/statsQueries";

export type ManualRecordAction =
  | { kind: "add"; body: ManualStudySessionRequest }
  | { kind: "edit"; id: number; body: ManualStudySessionRequest }
  | { kind: "delete"; id: number };

/**
 * 수동 기록 추가·수정·삭제
 *
 * 세 동작은 성공 뒤 하는 일과 저장 중 비활성이 같아 mutation 하나로 받는다.
 * 지난 날짜 일간 조회는 캐시가 무기한이라 통계 키 전체를 무효화한다.
 * 과목별 누적 시간이 바뀌어 기록 탭이 받는 과목 목록도 무효화한다.
 * 다른 탭 웹뷰는 별도 문서라 이 문서의 무효화가 닿지 않아 네이티브에 알린다.
 * 409는 미리보기가 낡았다는 뜻이라 그날·다음 날 조회를 다시 받아 미리보기를 서버와 맞춘다.
 */
export function useManualRecordMutations(input: {
  userId: number;
  dateKey: string;
  onSuccess: (action: ManualRecordAction, saved: readonly StudySessionResponse[]) => void;
  onError: (reason: "conflict" | "failed") => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: ManualRecordAction): Promise<StudySessionResponse[]> => {
      switch (action.kind) {
        case "add":
          return createManualRecord(action.body);
        case "edit":
          return updateManualRecord(action.id, action.body);
        case "delete":
          return deleteManualRecord(action.id).then(() => []);
      }
    },
    onSuccess: (saved, action) => {
      void queryClient.invalidateQueries({ queryKey: statsKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["subjects"] });
      postToNative({ type: "records-changed", atMs: Date.now() });
      input.onSuccess(action, saved);
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        void queryClient.invalidateQueries({
          queryKey: statsKeys.daily(input.userId, input.dateKey),
        });
        void queryClient.invalidateQueries({
          queryKey: statsKeys.daily(input.userId, addDaysToDateKey(input.dateKey, 1)),
        });
        input.onError("conflict");
        return;
      }
      input.onError("failed");
    },
  });
}
