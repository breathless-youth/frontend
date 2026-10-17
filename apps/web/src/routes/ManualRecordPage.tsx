import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ManualRecordForm } from "@/features/manual-record/ManualRecordForm";
import {
  type ManualRecordMode,
  bundleMayContinue,
  bundleOf,
  isManualSession,
} from "@/features/manual-record/manualRecord";
import { MANUAL_RECORD_PARAMS } from "@/features/manual-record/useOpenManualRecord";
import { addDaysToDateKey, isFutureDateKey, kstDateKey } from "@/features/records/recordsFormat";
import { subjectRefMap } from "@/features/records/recordsTimetable";
import { slideNavigate } from "@/lib/pageTransition";
import { dailyStatsQuery } from "@/lib/statsQueries";
import { listSubjects } from "@/lib/subjectApi";
import { hasTokenSource, useIdentityPending, useUserId } from "@/lib/userId";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 모양만 맞고 달력에 없는 날짜(2020-13-45)는 날짜 계산을 한 바퀴 돌리면 다른 날짜가 되어 걸러진다. */
function dateKeyOf(raw: string | null): string | null {
  return raw !== null && DATE_KEY_PATTERN.test(raw) && addDaysToDateKey(raw, 0) === raw
    ? raw
    : null;
}

function positiveIntOf(raw: string | null): number | null {
  const value = Number(raw);
  return raw !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-28 rounded-md" />
      <Skeleton className="h-19.25 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-full" />
      <Skeleton className="h-11 w-2/3 rounded-full" />
    </div>
  );
}

/**
 * 시간 직접 입력 화면(`/manual-record`)
 *
 * 바닥 시트로 열면 OS 키보드가 올라올 때 안전 영역만큼 시트가 너무 높이 밀려 탭 바 없는 전체 화면으로 연다.
 * 웹뷰가 다시 로드되면 라우터 state와 스택이 사라져 날짜·입구·칸 시각·기록 id를 주소에서 읽고, 필요한 조회도 이 화면이 받는다.
 * 그날과 다음 날을 받고, 수정이면 묶음이 시작한 날과 묶음이 자정을 넘겨 이어지는 날까지 받는다.
 */
export function ManualRecordPage() {
  const userId = useUserId();
  const identityPending = useIdentityPending();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const todayKey = kstDateKey();
  const dateKey = dateKeyOf(searchParams.get("date")) ?? todayKey;
  const rawEntry = searchParams.get("entry");
  const entry = rawEntry === "planner_button" || rawEntry === "planner_cell" ? rawEntry : "records";
  const editId = positiveIntOf(searchParams.get("id"));
  const startMs = positiveIntOf(searchParams.get("start")) ?? undefined;
  const isEdit = editId !== null;

  // 수동 기록 API는 토큰이 있어야 해서 토큰 없는 문서에서는 조회도 폼도 없다.
  const canWrite = userId !== null && hasTokenSource();
  const nextKey = addDaysToDateKey(dateKey, 1);
  const nextIsFuture = isFutureDateKey(nextKey, todayKey);
  const day = useQuery({ ...dailyStatsQuery(userId ?? 0, dateKey), enabled: canWrite });
  const next = useQuery({
    ...dailyStatsQuery(userId ?? 0, nextKey),
    enabled: canWrite && !nextIsFuture,
  });

  const edited = isEdit
    ? [...(day.data?.sessions ?? []), ...(next.data?.sessions ?? [])].find(
        (session) => session.id === editId,
      )
    : undefined;
  // 자정을 넘긴 묶음의 앞 조각은 묶음 키가 가리키는 날의 조회에만 있다.
  const startKey =
    edited?.submissionStartedAt === undefined
      ? null
      : kstDateKey(new Date(edited.submissionStartedAt));
  const prevKey = startKey !== null && startKey < dateKey ? startKey : null;
  const prev = useQuery({
    ...dailyStatsQuery(userId ?? 0, prevKey ?? ""),
    enabled: canWrite && prevKey !== null,
  });

  // 받은 마지막 조각이 자정에 딱 끝나면 묶음이 그다음 날로 이어질 수 있어 한 날 더 받는다.
  const baseLoaded =
    day.isSuccess && (nextIsFuture || next.isSuccess) && (prevKey === null || prev.isSuccess);
  const continueKey =
    edited !== undefined && baseLoaded
      ? bundleMayContinue(
          bundleOf(
            [prev.data, day.data, next.data].flatMap((data) => data?.sessions ?? []),
            edited.id,
          ),
        )
      : null;
  const extraKey =
    continueKey !== null && ![dateKey, nextKey, prevKey].includes(continueKey) ? continueKey : null;
  const extra = useQuery({
    ...dailyStatsQuery(userId ?? 0, extraKey ?? ""),
    enabled: canWrite && extraKey !== null,
  });
  const subjects = useQuery({
    queryKey: ["subjects", "list", userId],
    queryFn: () => listSubjects(),
    enabled: canWrite,
  });

  const loaded = [prev.data, day.data, next.data, extra.data].filter((data) => data !== undefined);
  const sessions = loaded.flatMap((data) => data.sessions);
  const subjectRefs = subjectRefMap(loaded.flatMap((data) => data.subjects ?? []));

  const needed = [
    day,
    ...(nextIsFuture ? [] : [next]),
    ...(prevKey === null ? [] : [prev]),
    ...(extraKey === null ? [] : [extra]),
    subjects,
  ];
  const failed = needed.filter((query) => query.isError);
  // 추가는 이웃 날 조회가 없어도 미리보기에서 그 기록만 빠지고 겹침은 서버가 자른다.
  // 수정은 묶음 조각이 빠진 채 저장하면 기록이 줄어들어 모두 받아야 연다.
  // 과목 목록이 없으면 과목 없음 칩만 보여 과목을 고를 수 없어 어느 모드든 받아야 연다.
  const blocked = isEdit ? failed.length > 0 : day.isError || subjects.isError;
  const pending = needed.some((query) => query.isPending);

  // 묶음 키가 없으면 겹침으로 잘린 다른 조각을 찾을 수 없다.
  // 조각 하나로 저장하면 서버가 묶음 전체를 지우고 새로 만들어 나머지 조각이 사라지므로 수정 화면을 열지 않는다.
  const mode: ManualRecordMode | null = !isEdit
    ? { kind: "add", entry, startMs }
    : edited !== undefined && isManualSession(edited) && edited.submissionStartedAt !== undefined
      ? {
          kind: "edit",
          entry: entry === "records" ? "records" : "planner_cell",
          bundle: bundleOf(sessions, edited.id),
        }
      : null;

  // 저장 중에 뒤로 가도 저장 성공이 onDone을 부른다. 이미 떠난 화면이 한 번 더 돌아가지 않게 막는다.
  const leftRef = useRef(false);
  useEffect(() => {
    // 개발 모드의 두 번 마운트에서도 다시 풀리게 마운트마다 되돌린다.
    leftRef.current = false;
    return () => {
      leftRef.current = true;
    };
  }, []);

  const leave = () => {
    if (leftRef.current) {
      return;
    }
    leftRef.current = true;
    slideNavigate("back", () => {
      const historyState = window.history.state as { idx?: number } | null;
      if (historyState?.idx) {
        navigate(-1);
        return;
      }
      // 스택이 비어 있다. 웹뷰가 다시 떠 이 화면으로 복원됐다. 설정 탭이 아니라 들어온 화면의 같은 날로 돌려보낸다.
      const params = new URLSearchParams(location.search);
      for (const key of MANUAL_RECORD_PARAMS) {
        params.delete(key);
      }
      params.set("date", dateKey);
      navigate(
        {
          pathname: entry === "records" ? "/records" : "/planner",
          search: `?${params.toString()}`,
        },
        { replace: true },
      );
    });
  };

  // 다른 탭에서 지웠거나 측정 기록 id로 열렸다. 고칠 기록이 없어 돌아간다.
  const missing = isEdit && canWrite && !pending && !blocked && mode === null;
  const leaveMissing = useEffectEvent(leave);
  useEffect(() => {
    if (missing) {
      leaveMissing();
    }
  }, [missing]);

  return (
    <main className="theme-soft-blue bg-soft-blue flex min-h-dvh flex-col overflow-x-hidden text-foreground">
      <ScreenBackHeader title={isEdit ? "기록 수정" : "시간 직접 입력"} onBack={leave} />

      <div className="flex flex-1 flex-col px-5 pt-3">
        {identityPending ? (
          <FormSkeleton />
        ) : userId === null || !canWrite ? (
          <p className="text-sm text-muted-foreground">
            기기 등록 전이에요. 앱에서 열면 기록이 저장돼요
          </p>
        ) : blocked ? (
          <ErrorState
            message="기록을 불러오지 못했어요"
            onRetry={() => {
              for (const query of failed) {
                void query.refetch();
              }
            }}
            screen={entry === "records" ? "records" : "planner"}
          />
        ) : pending || mode === null ? (
          <FormSkeleton />
        ) : (
          <ManualRecordForm
            userId={userId}
            dateKey={dateKey}
            mode={mode}
            sessions={sessions}
            subjects={subjects.data ?? null}
            subjectRefs={subjectRefs}
            onDone={leave}
          />
        )}
      </div>
    </main>
  );
}
