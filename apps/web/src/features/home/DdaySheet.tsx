import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import type { SubmitEvent } from "react";

import type { DdayRequest, DdayResponse } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { IconChevronDown } from "@/features/records/icons";
import { trackDdayDeleted, trackDdaySaved } from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { deleteDday, putDday } from "@/lib/ddayApi";
import { todayKstDateKey } from "@/lib/dateKst";
import { ddayKeys } from "@/lib/ddayQueries";
import { cn } from "@/lib/utils";

import { DdayCalendar } from "./DdayCalendar";
import { daysUntil, formatDday, formatKoreanDate } from "./ddayFormat";

/** 서버와 같은 상한. 입력은 여기서 막고 서버는 최종 판정만 한다. */
const DDAY_TITLE_MAX_LENGTH = 15;

/**
 * D-Day 설정 시트
 *
 * 홈 좌상단 블록이 연다. 홈이 `theme-soft-blue`를 서브트리에만 켜고 포털은 body로 나가므로 시트에도 같은 테마를 단다.
 * 닫을 때 포커스를 블록으로 돌려보내지 않는다. 스크립트 포커스라 WebKit이 블록에 링을 남긴다.
 * ponytail: 키보드로 Esc·저장을 눌러 닫아도 포커스가 body 로 떨어진다 — 외장 키보드
 * 사용을 챙길 일이 생기면 닫힌 경로별로 갈라 복귀시킨다.
 */
export function DdaySheet({
  open,
  onOpenChange,
  userId,
  dday,
  formKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  dday: DdayResponse | null;
  /** 열 때마다 바뀌어 폼을 새로 만든다. */
  formKey: number;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Drawer
      open={open}
      // 시트 안 확인 창은 Radix라 Base UI가 바깥으로 본다. 모달로 두면 시트의 포커스 가두기·바깥 비활성이
      // 확인 창과 다투고, 확인 창을 누르는 것이 시트 바깥 누름이 된다.
      modal={!confirmingDelete}
      disablePointerDismissal={confirmingDelete}
      onOpenChange={(next, details) => {
        // 확인 창의 Esc는 Radix와 Base UI가 둘 다 받아 시트까지 닫는다. 확인 창이 떠 있는 동안의 닫기는 버린다.
        if (!next && confirmingDelete) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent className="theme-soft-blue" finalFocus={false}>
        <DdayForm
          key={formKey}
          userId={userId}
          dday={dday}
          confirmingDelete={confirmingDelete}
          onConfirmingDeleteChange={setConfirmingDelete}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DrawerContent>
    </Drawer>
  );
}

/**
 * 시트 안 폼. `key`로 열 때마다 새로 만들어 직전 입력이 남지 않게 한다.
 * 위에서 아래로 제목줄(오른쪽에 고른 날의 D-N) · 달력 · 제목 입력 · 저장/삭제.
 * 달력은 키보드가 떠 있는 동안(제목에 포커스)만 날짜 칩 한 줄로 접혀 키보드 위에 폼이 남는다. 완료·바깥
 * 탭으로 키보드가 내려가면(포커스를 잃으면) 다시 펼친다. 칩을 눌러도 키보드를 내리고 펼친다.
 * 저장은 날짜·제목이 다 있을 때만 켜지고, 삭제는 편집일 때만 보이며 확인 다이얼로그를 거쳐 지운다.
 */
function DdayForm({
  userId,
  dday,
  confirmingDelete,
  onConfirmingDeleteChange,
  onClose,
}: {
  userId: number;
  dday: DdayResponse | null;
  /** 확인 창이 떠 있는지. 시트가 그동안 모달을 풀어야 해 시트 쪽이 들고 있다. */
  confirmingDelete: boolean;
  onConfirmingDeleteChange: (confirming: boolean) => void;
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

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  return (
    // noValidate: 검증은 서버가 하고 이 폼은 결과 문구만 보여 준다.
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("flex flex-col", titleFocused ? "gap-4 pt-4" : "gap-5 pt-5")}
    >
      <div className="flex items-baseline justify-between">
        <DrawerTitle className="text-[18px] leading-5.25 font-bold text-foreground">
          목표 날짜 설정
        </DrawerTitle>
        <span
          data-testid="dday-sheet-days"
          className="text-[15px] leading-4.5 font-extrabold text-primary tabular-nums"
        >
          {selectedLabel}
        </span>
      </div>

      {/* 시트 안 버튼·입력은 끌기에서 뺀다. iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려진다.
          제목줄과 빈 곳에서는 그대로 끌어 닫힌다. 달력은 가로 넘김 영역이라 `DdayCalendar`가 따로 표시한다. */}
      {titleFocused ? (
        <button
          data-base-ui-swipe-ignore=""
          type="button"
          // 누르는 순간(mousedown) 제목이 포커스를 잃으면 칩이 달력으로 바뀐 뒤에 click이 떨어져
          // 칩 자리에 온 달력 칸이 눌린다. 포커스는 click에서 내린다 — onBlur가 달력을 펼친다.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => titleRef.current?.blur()}
          className="flex h-13 items-center justify-between rounded-2xl bg-brand-subtle px-4"
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "text-[15px] leading-4.5 font-semibold",
                targetDate === null ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {targetDate === null ? "날짜를 골라 주세요" : formatKoreanDate(targetDate)}
            </span>
            <IconChevronDown size={9} color="var(--color-muted-foreground)" />
          </span>
          <span className="text-[15px] leading-4.5 font-extrabold text-primary tabular-nums">
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

      <div data-base-ui-swipe-ignore="" className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-sm leading-4.25 font-bold text-muted-foreground">
          제목
        </label>
        <div
          className={cn(
            "flex h-13 items-center justify-between rounded-xl border bg-muted px-4 transition-[border-color,box-shadow] duration-150",
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
        <p role="alert" className="text-sm leading-4.25 text-state-distract-text">
          {error}
        </p>
      )}

      <div data-base-ui-swipe-ignore="" className="flex flex-col gap-2 pt-1">
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
            onClick={() => onConfirmingDeleteChange(true)}
          >
            삭제
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="목표 날짜를 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제"
        onCancel={() => onConfirmingDeleteChange(false)}
        onConfirm={() => {
          onConfirmingDeleteChange(false);
          setError(null);
          deleteMutation.mutate();
        }}
      />
    </form>
  );
}
