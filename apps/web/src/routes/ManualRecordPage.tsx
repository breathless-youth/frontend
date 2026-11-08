import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MANUAL_RECORD_PARAMS } from "@/features/manual-record/useOpenManualRecord";
import { plannerDateKeyOf } from "@/features/planner/plannerDay";
import { plannerEntryOf } from "@/features/planner/useOpenPlanner";
import { addDaysToDateKey } from "@/features/records/recordsFormat";
import { localDateKey } from "@/lib/dateKey";
import { ApiError } from "@/lib/api";
import { studySessionDetailQuery } from "@/lib/statsQueries";
import { hasTokenSource, useIdentityPending, useUserId } from "@/lib/userId";

function validDate(raw: string | null): raw is string {
  return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) && addDaysToDateKey(raw, 0) === raw;
}
function positiveInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * 이전 /manual-record URL의 호환 입구. 이전 입력 폼 대신 기록 편집기로 이동한다.
 * 이전 date는 자정 기준이므로 시각/id가 있으면 실제 시각의 05시 플래너를 찾는다.
 * 날짜만 있는 추가는 선택일 05시~다음 날 05시를 열고, 새벽의 오늘은 현재 플래너를 연다.
 */
export function ManualRecordPage() {
  const { t } = useTranslation("manual-record");
  const location = useLocation();
  const [params] = useSearchParams();
  const userId = useUserId();
  const identityPending = useIdentityPending();
  const canWrite = hasTokenSource() && userId !== null;
  const today = localDateKey();
  const requestedDate = params.get("date");
  const date = validDate(requestedDate) && requestedDate <= today ? requestedDate : today;
  const id = positiveInt(params.get("id"));
  const detail = useQuery({
    ...studySessionDetailQuery(userId ?? 0, id ?? 0),
    enabled: canWrite && !identityPending && id !== null,
  });
  if (identityPending || (canWrite && id !== null && detail.isPending)) {
    return <Skeleton className="m-5 h-96 rounded-xl" />;
  }
  if (
    canWrite &&
    id !== null &&
    detail.isError &&
    !(detail.error instanceof ApiError && detail.error.status === 404)
  ) {
    return (
      <ErrorState
        message={t("page.loadFailed")}
        onRetry={() => void detail.refetch()}
        screen="records"
      />
    );
  }
  const rawStart = positiveInt(params.get("start"));
  const start =
    rawStart !== null &&
    Number.isFinite(new Date(rawStart).getTime()) &&
    localDateKey(new Date(rawStart)) === date
      ? rawStart
      : undefined;
  const anchor = detail.data ? Date.parse(detail.data.startedAt) : start;
  const plannerToday = plannerDateKeyOf(new Date());
  const plannerDate = canWrite
    ? anchor !== undefined && Number.isFinite(anchor)
      ? plannerDateKeyOf(new Date(anchor))
      : date > plannerToday
        ? plannerToday
        : date
    : date;
  const from =
    params.get("entry") === "records" ? "records" : (plannerEntryOf(location) ?? "records");
  const next = new URLSearchParams(location.search);
  for (const key of MANUAL_RECORD_PARAMS) next.delete(key);
  next.delete("edit");
  next.delete("returnDate");
  next.set("date", plannerDate);
  next.set("from", from);
  if (canWrite) {
    next.set("edit", "records");
    if (from === "records" && date !== plannerDate) next.set("returnDate", date);
  }
  return (
    <Navigate replace to={{ pathname: "/planner", search: `?${next}` }} state={{ via: from }} />
  );
}
