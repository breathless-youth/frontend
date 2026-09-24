import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import type { DdayRequest, DdayResponse } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { IconChevronDown } from "@/features/records/icons";
import {
  setDdayUserProperties,
  trackDdayDeleted,
  trackDdaySaved,
  trackDdaySheetOpened,
} from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { deleteDday, putDday } from "@/lib/ddayApi";
import { ddayKeys, ddayQuery } from "@/lib/ddayQueries";
import { cn } from "@/lib/utils";

import { DdayCalendar } from "./DdayCalendar";
import { daysUntil, formatDday, formatKoreanDate, todayLocalDateKey } from "./ddayFormat";

/** 서버와 같은 상한. 입력은 여기서 막고 서버는 최종 판정만 한다. */
export const DDAY_TITLE_MAX_LENGTH = 10;

/**
 * 홈 좌상단 D-Day 블록과 설정 시트.
 *
 * 블록 자체가 시트의 트리거다. 설정된 D-Day가 있으면 `D-N` 큰 숫자 위에 제목이 작게 붙고, 없으면
 * 같은 두 줄 모양으로 위에 `D-Day`, 제목 자리에 `목표 날짜를 설정하세요`가 온다. 어느 쪽이든 탭하면
 * 시트 하나가 열린다(신규·편집 공용). 시트 모양은 Claude Design `D-Day Prototype`이 원본이다.
 * 지난 D-Day는 지우지 않고 `D+N`을 다른 색으로 보여 준다.
 *
 * 조회 실패는 미설정처럼 그린다. 저장은 upsert라 그 상태에서 저장해도 서버 값이 덮이고, 응답으로
 * 캐시가 다시 채워져 스스로 복구된다. 홈 통계의 오류 상태와 달리 이 블록에는 재시도 버튼이 없다.
 */
export function DdaySection({ userId }: { userId: number }) {
  const query = useQuery(ddayQuery(userId));
  const [open, setOpen] = useState(false);

  const dday = query.data ?? null;
  const loaded = query.data !== undefined || query.isError;

  // D-Day 유무별 세그먼트용 user property. 홈이 열려 값을 알게 될 때마다 맞춘다.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    setDdayUserProperties(dday === null ? null : { daysLeft: daysUntil(dday.targetDate) });
  }, [loaded, dday]);

  function handleOpenChange(next: boolean) {
    if (next) {
      trackDdaySheetOpened(dday !== null);
    }
    setOpen(next);
  }

  if (!loaded) {
    return <Skeleton className="h-[54px] w-32 rounded-lg" />;
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <DdayBlock dday={dday} />
      </SheetTrigger>
      {/* 홈이 `theme-soft-blue`를 서브트리에만 켠다. 포털이 body로 나가므로 시트에도 같은 테마를 단다. */}
      <SheetContent
        side="bottom"
        className="theme-soft-blue rounded-t-[24px] border-t-0 px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(0,0,0,0.18)]"
        // 설명 없는 시트다. 비워 두면 Radix가 aria-describedby 누락을 경고한다.
        aria-describedby={undefined}
      >
        <DdayForm
          key={String(open)}
          userId={userId}
          dday={dday}
          onDone={() => {
            setOpen(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * 좌상단 블록. `SheetTrigger asChild`가 버튼에 열기 핸들러와 aria를 붙인다.
 * 미설정도 같은 두 줄이라 설정 전후로 헤더 높이가 흔들리지 않는다.
 */
function DdayBlock({ dday, ...triggerProps }: { dday: DdayResponse | null }) {
  const daysLeft = dday === null ? null : daysUntil(dday.targetDate);
  const label = daysLeft === null ? "D-Day" : formatDday(daysLeft);
  const caption = dday === null ? "목표 날짜를 설정하세요" : dday.title;
  return (
    <button
      type="button"
      aria-label={dday === null ? "D-Day 설정" : `${label} ${dday.title}, D-Day 수정`}
      className="flex flex-col items-start text-left"
      {...triggerProps}
    >
      <span
        data-testid="dday-label"
        className={cn(
          "text-[32px] leading-[38px] font-extrabold tracking-[-0.8px] tabular-nums",
          // 지난 D-Day는 색으로 구분한다. 시안 색이 정해지면 여기만 바꾼다.
          daysLeft !== null && daysLeft < 0 ? "text-muted-foreground" : "text-primary",
        )}
      >
        {label}
      </span>
      <span data-testid="dday-caption" className="text-[13px] leading-4 text-muted-foreground">
        {caption}
      </span>
    </button>
  );
}

/**
 * 시트 안 폼. `key`로 열 때마다 새로 만들어 직전 입력이 남지 않게 한다.
 * 위에서 아래로 손잡이 · 제목줄(오른쪽에 고른 날의 D-N) · 달력 · 제목 입력 · 저장/삭제.
 * 제목에 포커스가 가면 달력이 날짜 칩 한 줄로 접혀 키보드 위에 폼이 남는다. 칩을 누르면 다시 펼친다.
 * 저장은 날짜·제목이 다 있을 때만 켜지고, 삭제는 편집일 때만 보이며 확인 없이 바로 지운다.
 */
function DdayForm({
  userId,
  dday,
  onDone,
}: {
  userId: number;
  dday: DdayResponse | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(dday?.title ?? "");
  const [targetDate, setTargetDate] = useState<string | null>(dday?.targetDate ?? null);
  const [titleFocused, setTitleFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = todayLocalDateKey();

  const saveMutation = useMutation({
    // react-query가 두 번째 인자로 컨텍스트를 넘기므로 API 함수에 그대로 물리지 않는다
    mutationFn: (body: DdayRequest) => putDday(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(ddayKeys.detail(userId), saved);
      const daysLeft = daysUntil(saved.targetDate);
      trackDdaySaved({ isNew: dday === null, daysLeft, titleLength: saved.title.length });
      setDdayUserProperties({ daysLeft });
      onDone();
    },
    onError: (cause) => {
      // 서버 400은 날짜뿐이다 — 제목 길이·공백은 입력에서 이미 막는다.
      setError(
        cause instanceof ApiError && cause.status === 400
          ? "오늘 이후 날짜를 골라 주세요"
          : "잠시 후 다시 시도해 주세요",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDday(),
    onSuccess: () => {
      queryClient.setQueryData(ddayKeys.detail(userId), null);
      if (dday !== null) {
        trackDdayDeleted(daysUntil(dday.targetDate));
      }
      setDdayUserProperties(null);
      onDone();
    },
    onError: () => {
      setError("잠시 후 다시 시도해 주세요");
    },
  });

  const trimmedTitle = title.trim();
  const canSave = targetDate !== null && trimmedTitle !== "";
  const busy = saveMutation.isPending || deleteMutation.isPending;
  const selectedLabel = targetDate === null ? "" : formatDday(daysUntil(targetDate));

  function submit() {
    if (!canSave || busy || targetDate === null) {
      return;
    }
    if (targetDate < todayKey) {
      setError("오늘 이후 날짜를 골라 주세요");
      return;
    }
    setError(null);
    saveMutation.mutate({ title: trimmedTitle, targetDate });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  /** 접힌 칩을 누르면 키보드를 내리고 달력을 다시 펼친다. */
  function expandCalendar() {
    titleRef.current?.blur();
    setTitleFocused(false);
  }

  return (
    // noValidate: 검증은 서버가 하고 이 폼은 결과 문구만 보여 준다.
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("flex flex-col", titleFocused ? "gap-4" : "gap-5")}
    >
      <div aria-hidden="true" className="h-1 w-9 self-center rounded-full bg-[#d1d6db]" />

      <div className="flex items-baseline justify-between">
        <SheetTitle className="text-[20px] leading-6 font-bold text-foreground">D-Day</SheetTitle>
        <span
          data-testid="dday-sheet-days"
          className="text-[15px] leading-[18px] font-extrabold text-primary tabular-nums"
        >
          {selectedLabel}
        </span>
      </div>

      {titleFocused ? (
        <button
          type="button"
          onClick={expandCalendar}
          className="flex h-[52px] items-center justify-between rounded-2xl bg-brand-subtle px-4"
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "text-[15px] leading-[18px] font-semibold",
                targetDate === null ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {targetDate === null ? "날짜를 골라 주세요" : formatKoreanDate(targetDate)}
            </span>
            <IconChevronDown size={9} color="var(--color-muted-foreground)" />
          </span>
          <span className="text-[15px] leading-[18px] font-extrabold text-primary tabular-nums">
            {selectedLabel}
          </span>
        </button>
      ) : (
        <DdayCalendar
          value={targetDate}
          todayKey={todayKey}
          onChange={(dateKey) => {
            setTargetDate(dateKey);
            setError(null);
          }}
        />
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-sm leading-[17px] font-bold text-muted-foreground">
          제목
        </label>
        <div
          className={cn(
            "flex h-[52px] items-center justify-between rounded-[20px] border bg-muted px-4 transition-[border-color,box-shadow] duration-150",
            titleFocused
              ? "border-primary shadow-[0_0_0_1px_var(--color-primary)]"
              : "border-border",
          )}
        >
          <input
            ref={titleRef}
            id={titleId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onFocus={() => setTitleFocused(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                titleRef.current?.blur();
                submit();
              }
            }}
            maxLength={DDAY_TITLE_MAX_LENGTH}
            placeholder="예: 수능"
            autoComplete="off"
            enterKeyHint="done"
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-text-tertiary"
          />
          <span className="text-xs text-text-tertiary tabular-nums">
            {title.length}/{DDAY_TITLE_MAX_LENGTH}
          </span>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm leading-[17px] text-state-distract-text">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" size="xl" disabled={!canSave || busy}>
          {saveMutation.isPending && (
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
            />
          )}
          {saveMutation.isPending ? "저장 중" : "저장"}
        </Button>
        {dday !== null && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="text-sm font-medium text-muted-foreground"
            disabled={busy}
            onClick={() => {
              setError(null);
              deleteMutation.mutate();
            }}
          >
            삭제
          </Button>
        )}
      </div>
    </form>
  );
}
