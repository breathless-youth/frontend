import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";

import type { DdayRequest, DdayResponse } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { todayKstDateKey } from "@/lib/dateKst";
import { ddayKeys, ddayQuery } from "@/lib/ddayQueries";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";
import { cn } from "@/lib/utils";

import { DdayCalendar } from "./DdayCalendar";
import { daysUntil, formatDday, formatKoreanDate } from "./ddayFormat";

/** 서버와 같은 상한. 입력은 여기서 막고 서버는 최종 판정만 한다. */
export const DDAY_TITLE_MAX_LENGTH = 15;

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
  const sheetRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // 열 때마다 1씩 올라 폼을 새로 만든다. `open`을 key로 쓰면 닫히는 순간 폼이 리셋돼 300ms 닫힘
  // 애니메이션 동안 방금 저장한 내용이 빈 폼으로 바뀌는 게 보인다.
  const [openCount, setOpenCount] = useState(0);

  const dday = query.data ?? null;
  const loaded = query.data !== undefined || query.isError;
  const targetDate = dday?.targetDate ?? null;

  // D-Day 유무별 세그먼트용 user property. 이 effect 한 곳에서만 보낸다 — 저장·삭제도 캐시가 바뀌면
  // 여기로 흘러오므로 뮤테이션 콜백에서 따로 부르면 identify가 두 번 나간다.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    setDdayUserProperties(targetDate === null ? null : { daysLeft: daysUntil(targetDate) });
  }, [loaded, targetDate]);

  function handleOpenChange(next: boolean) {
    if (next) {
      trackDdaySheetOpened(dday !== null);
      setOpenCount((count) => count + 1);
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
        ref={sheetRef}
        side="bottom"
        // Radix 기본값은 첫 탭 가능 요소, 여기서는 달력의 `이전 달` 화살표로 포커스를 옮긴다 —
        // 터치로 연 시트에 쓸모없는 포커스 링만 남는다. 시트 자체로 보내면 스크린리더는 그대로
        // 시트 안으로 들어오고 링은 생기지 않는다(`ui/sheet.tsx`가 컨테이너 링을 끈다).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          sheetRef.current?.focus();
        }}
        // 닫을 때 Radix 는 포커스를 트리거(좌상단 블록)로 되돌리는데, 스크립트 포커스라
        // WebKit 이 링을 그려 시트를 닫을 때마다 블록에 사각형이 남는다. 터치 전용 화면이라
        // 되돌릴 곳이 없어도 되므로 막는다.
        // ponytail: 키보드로 Esc·저장을 눌러 닫아도 포커스가 body 로 떨어진다 — 외장 키보드
        // 사용을 챙길 일이 생기면 닫힌 경로별로 갈라 복귀시킨다.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        className="theme-soft-blue rounded-t-[24px] border-t-0 px-5 pt-3 pb-[max(32px,calc(env(safe-area-inset-bottom)+8px))] shadow-[0_-12px_40px_rgba(0,0,0,0.18)]"
        // 설명 없는 시트다. 비워 두면 Radix가 aria-describedby 누락을 경고한다.
        aria-describedby={undefined}
      >
        <DdayForm
          key={openCount}
          userId={userId}
          dday={dday}
          onClose={() => {
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
      <span className="flex items-center gap-2">
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
        {/* 탭할 수 있다는 힌트 — 시안대로 숫자 옆에 작게, 글자 중심선보다 살짝 아래 */}
        <IconChevronDown size={12} color="var(--color-muted-foreground)" className="mt-[3px]" />
      </span>
      <span data-testid="dday-caption" className="text-[13px] leading-4 text-muted-foreground">
        {caption}
      </span>
    </button>
  );
}

/**
 * 시트 안 폼. `key`로 열 때마다 새로 만들어 직전 입력이 남지 않게 한다.
 * 위에서 아래로 손잡이(잡고 내리면 닫힌다) · 제목줄(오른쪽에 고른 날의 D-N) · 달력 · 제목 입력 · 저장/삭제.
 * 달력은 키보드가 떠 있는 동안(제목에 포커스)만 날짜 칩 한 줄로 접혀 키보드 위에 폼이 남는다. 완료·바깥
 * 탭으로 키보드가 내려가면(포커스를 잃으면) 다시 펼친다. 칩을 눌러도 키보드를 내리고 펼친다.
 * 저장은 날짜·제목이 다 있을 때만 켜지고, 삭제는 편집일 때만 보이며 확인 다이얼로그를 거쳐 지운다.
 */
function DdayForm({
  userId,
  dday,
  onClose,
}: {
  userId: number;
  dday: DdayResponse | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  // 달력의 하한은 서버 판정과 같은 KST 오늘이다(오늘 포함). 남은 일수 표시만 기기 날짜를 쓴다.
  const todayKey = todayKstDateKey();
  const [title, setTitle] = useState(dday?.title ?? "");
  // 지난 D-Day를 열면 날짜를 비운다 — 서버가 지난 날을 받지 않으니 새 목표일부터 고르게 한다.
  const [targetDate, setTargetDate] = useState<string | null>(
    dday !== null && dday.targetDate >= todayKey ? dday.targetDate : null,
  );
  const [titleFocused, setTitleFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const saveMutation = useMutation({
    // react-query가 두 번째 인자로 컨텍스트를 넘기므로 API 함수에 그대로 물리지 않는다
    mutationFn: (body: DdayRequest) => putDday(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(ddayKeys.detail(userId), saved);
      trackDdaySaved({
        isNew: dday === null,
        daysLeft: daysUntil(saved.targetDate),
        titleLength: saved.title.length,
      });
      onClose();
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
      onClose();
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
    // 날짜 판정은 서버가 한다 — 달력이 지난 날을 막고, 그래도 어긋나면 400 문구를 보여 준다.
    setError(null);
    saveMutation.mutate({ title: trimmedTitle, targetDate });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  return (
    // noValidate: 검증은 서버가 하고 이 폼은 결과 문구만 보여 준다.
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("flex flex-col", titleFocused ? "gap-4" : "gap-5")}
    >
      <SheetHandle onDismiss={onClose} />

      <div className="flex items-baseline justify-between">
        <SheetTitle className="text-[18px] leading-[21px] font-bold text-foreground">
          목표 날짜 설정
        </SheetTitle>
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
          // 누르는 순간(mousedown) 제목이 포커스를 잃으면 칩이 달력으로 바뀐 뒤에 click이 떨어져
          // 칩 자리에 온 달력 칸이 눌린다. 포커스는 click에서 내린다 — onBlur가 달력을 펼친다.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => titleRef.current?.blur()}
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
            // ponytail: Android 뒤로 가기는 키보드만 내리고 포커스를 남겨 칩이 그대로다 — 칩을
            // 누르면 펼쳐진다. 거슬리면 visualViewport 높이로 키보드 내림을 잡는다.
            onBlur={() => setTitleFocused(false)}
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
            onClick={() => setConfirmingDelete(true)}
          >
            삭제
          </Button>
        )}
      </div>

      <DeleteConfirmDialog
        open={confirmingDelete}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          setError(null);
          deleteMutation.mutate();
        }}
      />
    </form>
  );
}

/**
 * 삭제 확인 — 시트 위에 뜨는 작은 다이얼로그. 틀은 카메라 켜기 확인 모달과 같고(공용 `ui/dialog.tsx`,
 * `theme-soft-blue` 스코프), 설명 줄 없이 제목과 두 버튼만 둔다. Esc·딤 탭은 취소다.
 */
function DeleteConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const focusRestore = useDialogFocusRestore();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onOpenAutoFocus={focusRestore.onOpenAutoFocus}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        className="theme-soft-blue w-full max-w-[320px] gap-0 rounded-3xl border-0 bg-muted px-[22px] pt-[26px] pb-[22px] text-foreground shadow-[0_20px_25px_rgba(0,0,0,0.4)] sm:rounded-3xl"
        // 설명 없는 다이얼로그다. 비워 두면 Radix가 aria-describedby 누락을 경고한다.
        aria-describedby={undefined}
      >
        {/* 시트 제목(`목표 날짜 설정`)과 같은 굵기·크기 — 카메라 확인 모달의 extrabold는 여기선 과했다. */}
        <DialogTitle className="text-[18px] leading-[21px] font-bold text-foreground">
          D-Day를 삭제할까요?
        </DialogTitle>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="h-[52px] flex-1 rounded-lg bg-bg-layer-2 text-[15px] font-semibold text-foreground"
          >
            취소
          </Button>
          <Button
            type="button"
            variant="unstyled"
            onClick={onConfirm}
            className="h-[52px] flex-1 rounded-lg bg-feedback-danger text-[15px] font-semibold text-white hover:opacity-90"
          >
            삭제
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 손잡이를 놓았을 때 이만큼 이상 내려와 있으면 닫는다. 덜 내렸으면 제자리로 돌아간다. */
const DISMISS_THRESHOLD_PX = 80;
/** `ui/sheet.tsx`의 `duration-300` — 시트 퇴장 키프레임 길이. */
const SHEET_CLOSE_MS = 300;

/**
 * 시트 손잡이. 잡고 끌면 시트가 손가락을 따라 내려오고, 충분히 내린 채 놓으면 닫힌다.
 * 시트 요소는 가장 가까운 dialog로 찾는다(Radix Content가 그 역할을 단다). 보이는 막대는 4px지만
 * 잡는 영역은 시트 위 여백과 아래 간격까지 음수 마진으로 넓힌다 — 레이아웃은 그대로다.
 */
function SheetHandle({ onDismiss }: { onDismiss: () => void }) {
  const startYRef = useRef<number | null>(null);

  function sheetOf(event: ReactPointerEvent<HTMLDivElement>) {
    return event.currentTarget.closest<HTMLElement>('[role="dialog"]');
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const sheet = sheetOf(event);
    if (sheet === null) {
      return;
    }
    startYRef.current = event.clientY;
    // 손가락이 손잡이를 벗어나도 move/up을 계속 받는다.
    event.currentTarget.setPointerCapture(event.pointerId);
    // 시트에 걸린 transition(`duration-300`)이 끌리는 동안 transform을 늦추지 않게 끈다.
    sheet.style.transition = "none";
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const sheet = sheetOf(event);
    if (startYRef.current === null || sheet === null) {
      return;
    }
    sheet.style.transform = `translateY(${Math.max(0, event.clientY - startYRef.current)}px)`;
  }

  /** 제자리로. 시트에 원래 걸린 transition(300ms·ease-overlay)이 데려간다. */
  function settleBack(sheet: HTMLElement) {
    sheet.style.transition = "";
    sheet.style.transform = "";
  }

  // 시스템이 제스처를 가로챈 것(전화·알림 등)이라 사용자가 놓은 게 아니다 — 얼마나 내려왔든
  // 닫지 않고 되돌린다. 닫아 버리면 입력하던 제목·날짜가 그대로 사라진다.
  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    startYRef.current = null;
    const sheet = sheetOf(event);
    if (sheet !== null) {
      settleBack(sheet);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const startY = startYRef.current;
    startYRef.current = null;
    const sheet = sheetOf(event);
    if (startY === null || sheet === null) {
      return;
    }
    const dy = Math.max(0, event.clientY - startY);
    if (dy >= DISMISS_THRESHOLD_PX) {
      // 퇴장 키프레임(`slide-out-to-bottom`)은 `to`만 있어 지금 위치에서 이어 내려간다. 남은 거리만큼
      // 시간을 줄여 다 내려간 뒤 굼뜨게 남지 않게 한다.
      const remaining = Math.max(0.3, 1 - dy / sheet.offsetHeight);
      sheet.style.animationDuration = `${Math.round(SHEET_CLOSE_MS * remaining)}ms`;
      onDismiss();
      return;
    }
    settleBack(sheet);
  }

  return (
    // `touch-none`: 세로 드래그를 iOS가 스크롤로 집어 pointercancel을 내지 않게 한다.
    <div
      aria-hidden="true"
      data-testid="dday-sheet-handle"
      className="-mt-3 -mb-4 flex touch-none justify-center pt-3 pb-4"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="h-1 w-9 rounded-full bg-[#d1d6db]" />
    </div>
  );
}
