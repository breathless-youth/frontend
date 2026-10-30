import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import { ArrowRight, Info } from "lucide-react";

import type {
  ManualStudySessionRequest,
  StudySessionSummary,
  SubjectRef,
  SubjectResponse,
} from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { dayTitleWithWeekday, kstDateKey } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import {
  trackManualRecordAdd,
  trackManualRecordDelete,
  trackManualRecordEdit,
  trackManualRecordOverlapBlocked,
} from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

import {
  MANUAL_RECORD_COPY,
  type ManualRecordMode,
  type ManualSpan,
  applyChip,
  bundleSpan,
  clockOf,
  daysAgo,
  defaultSpan,
  endsNextDay,
  othersForOverlap,
  overlapNotice,
  reachedNow,
  spanFromClocks,
  spanMinutes,
  spanOf,
  subjectIdOf,
  trimOverlaps,
  validateSpan,
} from "./manualRecord";
import { useManualRecordMutations } from "./useManualRecordMutations";

const CHIPS = [
  { label: "+5분", minutes: 5 },
  { label: "+10분", minutes: 10 },
  { label: "+30분", minutes: 30 },
  { label: "+45분", minutes: 45 },
  { label: "+1시간", minutes: 60 },
] as const;

export interface ManualRecordFormProps {
  userId: number;
  /** 추가할 날짜. 수정은 묶음이 시작한 날짜를 쓴다. */
  dateKey: string;
  mode: ManualRecordMode;
  /** 기본값과 겹침 미리보기에 쓰는 조각. 페이지가 받은 날들의 일간 조회를 합친 것이다. */
  sessions: readonly StudySessionSummary[];
  /** 고를 수 있는 과목. 받기 전이면 null이다. */
  subjects: readonly SubjectResponse[] | null;
  /** 과목 id → 이름. 지운 과목 이름은 여기서만 찾는다. */
  subjectRefs: ReadonlyMap<number, SubjectRef>;
  /** 기본값과 미래 판정에 쓰는 지금. 넘기지 않으면 처음 그린 시각이다. */
  nowMs?: number;
  /** 저장이나 삭제가 성공했을 때. 페이지가 이전 화면으로 돌아간다. */
  onDone: () => void;
}

/**
 * 시간 직접 입력 폼
 *
 * 폼 상태는 마운트 때 한 번 정한다. 페이지가 필요한 조회를 다 받은 뒤 그려서 빈 조회로 기본값을 정하지 않는다.
 * 제목은 페이지 상단 바가 그리고, 날짜는 수정이면 묶음이 시작한 날이라 폼이 그린다.
 */
export function ManualRecordForm({
  userId,
  dateKey,
  mode,
  sessions,
  subjects,
  subjectRefs,
  nowMs: fixedNowMs,
  onDone,
}: ManualRecordFormProps) {
  const dateRef = useRef<HTMLParagraphElement>(null);
  const startId = useId();
  const endId = useId();
  const messageId = useId();
  const nextDayId = useId();
  // 렌더마다 시계를 읽지 않도록 지금은 화면을 열 때와 시각을 바꿀 때만 읽는다.
  // 화면을 열어 둔 채 시간이 흘러도 바꾸는 순간의 시각으로 미래를 판정해, 연 뒤에 지난 시각이 막히지 않는다.
  const readNow = () => fixedNowMs ?? Date.now();
  const [nowMs, setNowMs] = useState(readNow);
  const todayKey = kstDateKey(new Date(nowMs));
  const recordDateKey =
    mode.kind === "edit" ? kstDateKey(new Date(bundleSpan(mode.bundle).startMs)) : dateKey;

  const [span, setSpan] = useState<ManualSpan>(() =>
    mode.kind === "edit"
      ? bundleSpan(mode.bundle)
      : defaultSpan({ dateKey, todayKey, nowMs, sessions }),
  );
  // 주소로 받은 과목은 그사이 삭제됐을 수 있어 지금 목록에 있을 때만 고른다.
  const [subjectId, setSubjectId] = useState<number | null>(() =>
    mode.kind === "edit"
      ? subjectIdOf(mode.bundle[0])
      : (subjects?.find((subject) => subject.id === mode.subjectId)?.id ?? null),
  );
  const [serverError, setServerError] = useState<"conflict" | "failed" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const subjectLabelId = useId();

  // 앱 안 라우트 전환은 스크린리더 커서를 새 화면으로 보내지 않아, 첫 줄인 날짜에 포커스해 거기서부터 읽게 한다.
  useEffect(() => {
    dateRef.current?.focus();
  }, []);

  const spanError = validateSpan(span, nowMs);
  const pieces = trimOverlaps(
    span,
    othersForOverlap(sessions, mode.kind === "edit" ? mode.bundle : []),
  );
  const overlapBlocked = serverError === "conflict" || (spanError === null && pieces.length === 0);
  const blocking = spanError !== null || overlapBlocked;
  const recordDaysAgo = daysAgo(recordDateKey, todayKey);
  const message =
    serverError === "failed"
      ? MANUAL_RECORD_COPY.failed
      : spanError === "too-short"
        ? MANUAL_RECORD_COPY.tooShort
        : spanError === "future"
          ? MANUAL_RECORD_COPY.future
          : overlapBlocked
            ? MANUAL_RECORD_COPY.allOverlap
            : overlapNotice(span, pieces);

  const reportedBlockRef = useRef(false);
  useEffect(() => {
    if (!overlapBlocked || reportedBlockRef.current) {
      return;
    }
    reportedBlockRef.current = true;
    trackManualRecordOverlapBlocked({ entry: mode.entry, daysAgo: recordDaysAgo });
  }, [overlapBlocked, mode.entry, recordDaysAgo]);

  const mutation = useManualRecordMutations({
    userId,
    dateKey: recordDateKey,
    onSuccess: (action, saved) => {
      const savedMinutes = spanMinutes(saved.map(spanOf));
      if (mode.kind === "add") {
        trackManualRecordAdd({
          entry: mode.entry,
          durationMin: savedMinutes,
          hasSubject: subjectId !== null,
          daysAgo: recordDaysAgo,
          trimmedMin: Math.max(0, spanMinutes([span]) - savedMinutes),
          pieces: saved.length,
        });
      } else if (action.kind === "delete") {
        trackManualRecordDelete({
          entry: mode.entry,
          // 지운 양은 저장돼 있던 조각들이다. 겹침을 빼고 저장한 묶음은 바깥 구간보다 짧다.
          durationMin: spanMinutes(mode.bundle.map(spanOf)),
          daysAgo: recordDaysAgo,
        });
      } else {
        trackManualRecordEdit({
          entry: mode.entry,
          durationMin: savedMinutes,
          hasSubject: subjectId !== null,
          daysAgo: recordDaysAgo,
        });
      }
      // 무효화로 다시 받은 조회에 방금 저장한 기록이 들어오면 화면이 내려가기 전에 전부 겹침으로 보인다. 막힘으로 세지 않는다.
      reportedBlockRef.current = true;
      haptic("light");
      onDone();
    },
    onError: setServerError,
  });
  const busy = mutation.isPending;

  function changeSpan(next: ManualSpan, now = readNow()) {
    setSpan(next);
    setNowMs(now);
    setServerError(null);
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocking || busy) {
      return;
    }
    setServerError(null);
    const body: ManualStudySessionRequest = {
      startedAt: new Date(span.startMs).toISOString(),
      endedAt: new Date(span.endMs).toISOString(),
      ...(subjectId === null ? {} : { subjectId }),
    };
    // 묶음의 어느 조각 id로 불러도 서버가 묶음 전체를 바꾼다.
    mutation.mutate(
      mode.kind === "edit" ? { kind: "edit", id: mode.bundle[0]!.id, body } : { kind: "add", body },
    );
  }

  const live = subjects ?? [];
  // 지운 과목은 고를 수 없지만, 그 과목으로 저장된 기록을 고칠 때는 고른 채로 보여 준다.
  const deletedSubject =
    subjects !== null && subjectId !== null && !live.some((subject) => subject.id === subjectId)
      ? subjectRefs.get(subjectId)
      : undefined;

  return (
    // noValidate: 검증 문구는 이 폼이 aria-live로 직접 보여 준다.
    // 저장 버튼은 흐름 안에 둔다. 바닥에 고정하면 키보드가 올라올 때 다시 밀려 올라간다.
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-5">
      {/* 스크립트로 준 포커스에 WebKit이 남기는 포커스 링을 지운다. */}
      <p
        ref={dateRef}
        tabIndex={-1}
        className="text-[13px] leading-4 text-muted-foreground outline-none"
      >
        {dayTitleWithWeekday(recordDateKey)}
      </p>

      <div className="flex gap-3">
        <TimeField
          id={startId}
          label="시작"
          value={clockOf(span.startMs)}
          disabled={busy}
          invalid={blocking}
          describedBy={messageId}
          onChange={(clock) =>
            changeSpan(spanFromClocks(recordDateKey, clock, clockOf(span.endMs)))
          }
        />
        <ArrowRight aria-hidden size={16} className="mb-4.5 shrink-0 self-end text-text-tertiary" />
        <TimeField
          id={endId}
          label="종료"
          value={clockOf(span.endMs)}
          disabled={busy}
          invalid={blocking}
          describedBy={messageId}
          suffix={endsNextDay(span, recordDateKey) ? { id: nextDayId, text: "다음 날" } : null}
          onChange={(clock) =>
            changeSpan(spanFromClocks(recordDateKey, clockOf(span.startMs), clock))
          }
        />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {CHIPS.map((chip) => (
          <DurationChip
            key={chip.label}
            minutes={chip.minutes}
            label={chip.label}
            disabled={busy || reachedNow(span, nowMs)}
            onPress={() => {
              const now = readNow();
              changeSpan(applyChip(span, chip.minutes, now), now);
            }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p id={subjectLabelId} className="text-[13px] leading-4 font-medium text-muted-foreground">
          과목 선택
        </p>
        <div
          role="group"
          aria-labelledby={subjectLabelId}
          className="-mx-5 flex gap-2 overflow-x-auto px-5"
        >
          <SubjectChip
            pressed={subjectId === null}
            disabled={busy}
            onClick={() => setSubjectId(null)}
          >
            {MANUAL_RECORD_COPY.noSubject}
          </SubjectChip>
          {live.map((subject) => (
            <SubjectChip
              key={subject.id}
              pressed={subjectId === subject.id}
              disabled={busy}
              onClick={() => setSubjectId(subject.id)}
            >
              <SubjectDot colorIndex={subject.colorIndex} />
              {subject.name}
            </SubjectChip>
          ))}
          {deletedSubject !== undefined && (
            <SubjectChip pressed disabled>
              <SubjectDot colorIndex={deletedSubject.colorIndex} />
              {deletedSubject.name}
            </SubjectChip>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex items-start gap-1 text-[13px] leading-4 text-text-tertiary">
          <Info aria-hidden size={14} className="shrink-0 text-text-tertiary" />
          직접 추가한 기록은 연속 공부·랭킹에 반영되지 않아요
        </p>
        {/* 비어 있어도 aria-live 요소는 남겨 두어야 다음 안내가 낭독된다. */}
        <p
          id={messageId}
          aria-live="polite"
          className={cn(
            "text-[13px] leading-4 font-semibold break-keep",
            message === null
              ? "min-h-0"
              : blocking || serverError === "failed"
                ? "rounded-lg bg-feedback-danger/10 px-4 py-3 text-feedback-danger"
                : "rounded-lg bg-brand-subtle px-4 py-3 text-primary",
          )}
        >
          {message}
        </p>
      </div>

      <div className="sticky bottom-0 mt-auto flex gap-2 bg-(--bg-soft-blue-end) pt-3 pb-[max(32px,calc(env(safe-area-inset-bottom)+8px))]">
        {mode.kind === "edit" && (
          <Button
            variant="outline-destructive"
            size="xl"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="w-24 shrink-0"
          >
            삭제
          </Button>
        )}
        <Button type="submit" size="xl" disabled={blocking || busy} className="flex-1">
          저장
        </Button>
      </div>

      {mode.kind === "edit" && (
        <ConfirmDialog
          open={confirmingDelete}
          title="이 기록을 지울까요?"
          cancelLabel="취소"
          confirmLabel="지우기"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            setServerError(null);
            mutation.mutate({ kind: "delete", id: mode.bundle[0]!.id });
          }}
        />
      )}
    </form>
  );
}

/**
 * 1분 단위 네이티브 시각 입력. iOS는 OS 휠, Android는 시계 다이얼과 키보드 입력으로 열린다.
 * 라벨 옆 꼬리표는 라벨 밖에 있어 스크린리더가 읽지 않으므로 설명으로 잇는다.
 */
function TimeField({
  id,
  label,
  value,
  suffix = null,
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  suffix?: { id: string; text: string } | null;
  disabled: boolean;
  invalid: boolean;
  describedBy: string;
  onChange: (clock: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm leading-4.25 font-bold text-muted-foreground">
          {label}
        </label>
        {suffix !== null && (
          <span id={suffix.id} className="text-xs leading-3.75 font-semibold text-primary">
            {suffix.text}
          </span>
        )}
      </div>
      <input
        id={id}
        type="time"
        step={60}
        required
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={suffix === null ? describedBy : `${suffix.id} ${describedBy}`}
        onChange={(event) => {
          // Android 지우기 버튼으로 비운 값으로는 구간을 만들 수 없어 받지 않는다.
          if (event.target.value !== "") {
            onChange(event.target.value);
          }
        }}
        className="h-13 w-full min-w-0 appearance-none rounded-lg border border-border bg-muted px-3 text-[16px] font-medium text-foreground tabular-nums outline-none focus:border-primary [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit]:overflow-visible"
      />
    </div>
  );
}

/** 앱에서는 glass 캡슐 버튼으로 바뀌는 길이 칩 */
function DurationChip({
  minutes,
  label,
  disabled,
  onPress,
}: {
  minutes: number;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: `button-duration-${minutes}`,
      kind: "button",
      title: label,
      systemImage: null,
      shape: "capsule",
      disabled,
      accessibilityLabel: label,
    },
    () => {
      // 막히기 직전에 눌려 늦게 도착한 누름은 버린다.
      if (!disabled) {
        onPress();
      }
    },
  );
  return (
    <Button
      ref={ref}
      variant="outline"
      disabled={disabled}
      onClick={onPress}
      className="h-11 rounded-full px-0 text-[14px] font-semibold text-foreground"
    >
      {label}
    </Button>
  );
}

function SubjectChip({
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="outline"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 gap-1.5 rounded-full px-4 text-[14px] font-semibold text-foreground",
        pressed && "border-primary bg-brand-subtle text-primary",
      )}
    >
      {children}
    </Button>
  );
}

/** 과목 칩 앞의 색 표시. 플래너 과목 목록과 같은 색이라 어느 과목인지 눈으로 바로 잇는다. */
function SubjectDot({ colorIndex }: { colorIndex: number }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-[2px]"
      style={{ backgroundColor: subjectColorVar(colorIndex) }}
    />
  );
}
