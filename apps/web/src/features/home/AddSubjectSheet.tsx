import { useId, useState } from "react";
import type { SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { SUBJECT_SUGGESTIONS } from "@/features/study-session/sessionCopy";
import { SUBJECT_NAME_MAX } from "@/features/study-session/subjectInteractions";
import { reportHandled } from "@/lib/sentry";
import { cn } from "@/lib/utils";

/**
 * 홈 과목 추가 시트
 *
 * 환영 화면의 `과목 만들기`와 빈 화면의 `+ 과목 추가`가 같이 연다.
 * 홈이 `theme-soft-blue`를 서브트리에만 켜고 포털은 body로 나가므로 시트에도 같은 테마를 단다.
 * 이름이 겹치거나 저장에 실패하면 과목 목록 훅이 토스트로 알리고, 시트를 닫는 것은 호출부가 정한다.
 */
export function AddSubjectSheet({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, viaSuggestion: boolean) => Promise<void>;
}) {
  // 열 때마다 폼을 새로 만들어 직전 입력이 남지 않게 한다.
  // 닫힐 때 지우면 닫힘 애니메이션 동안 폼이 비어 보인다.
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormKey((key) => key + 1);
    }
  }

  return (
    <Drawer open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DrawerContent className="theme-soft-blue">
        <AddSubjectForm key={formKey} onSubmit={onSubmit} />
      </DrawerContent>
    </Drawer>
  );
}

function AddSubjectForm({
  onSubmit,
}: {
  onSubmit: (name: string, viaSuggestion: boolean) => Promise<void>;
}) {
  const inputId = useId();
  const countId = useId();
  const [name, setName] = useState("");
  // 추천 칩으로 채운 이름이다.
  // 그 뒤에 고치면 추천으로 만든 것이 아니다.
  const [suggested, setSuggested] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const over = name.length > SUBJECT_NAME_MAX;
  const canSubmit = trimmed !== "" && !over && !busy;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed, trimmed === suggested);
    } catch (error) {
      // 호출부는 실패를 토스트로 알리고 던지지 않으므로 여기 온 것은 예상 밖 오류라 보고만 한다.
      reportHandled(error, "add-subject-sheet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 pt-5">
      <DrawerTitle className="text-[18px] leading-5.25 font-bold text-foreground">
        과목 추가
      </DrawerTitle>

      {/*
        시트 안 버튼·입력은 끌기에서 뺀다.
        iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려진다.
      */}
      <div data-base-ui-swipe-ignore="" className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          과목 이름
        </label>
        <div className="flex h-13 items-center gap-3 rounded-xl border border-border bg-muted px-4 transition-[border-color,box-shadow] duration-150 focus-within:border-primary focus-within:shadow-[0_0_0_1px_var(--color-primary)]">
          <input
            id={inputId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby={countId}
            aria-invalid={over || undefined}
            placeholder="과목 이름"
            autoComplete="off"
            enterKeyHint="done"
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-text-tertiary"
          />
          <span
            id={countId}
            className={cn(
              "shrink-0 text-xs tabular-nums",
              over ? "text-state-distract-text" : "text-text-tertiary",
            )}
          >
            {name.length}/{SUBJECT_NAME_MAX}
          </span>
        </div>
        {over && (
          <p role="alert" className="text-sm leading-4.25 text-state-distract-text">
            {SUBJECT_NAME_MAX}자까지 쓸 수 있어요
          </p>
        )}
      </div>

      <div data-base-ui-swipe-ignore="" className="flex flex-wrap gap-2">
        {SUBJECT_SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            variant="secondary"
            disabled={busy}
            aria-pressed={trimmed === suggestion}
            onClick={() => {
              setName(suggestion);
              setSuggested(suggestion);
            }}
            // 칩은 작아도 누르는 자리는 44px이다.
            className={cn(
              "relative h-8 rounded-full px-3.5 text-sm font-medium before:absolute before:inset-x-0 before:-inset-y-1.5",
              trimmed === suggestion && "bg-primary text-primary-foreground",
            )}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      <div data-base-ui-swipe-ignore="" className="pt-1">
        <Button type="submit" size="xl" className="w-full" disabled={!canSubmit}>
          추가
        </Button>
      </div>
    </form>
  );
}
