import { Info } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { CharCount } from "@/components/ui/char-count";
import { focusWithoutScrollOnPress, isIosWeb } from "@/lib/iosInputFocus";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { cn } from "@/lib/utils";

import { BOTTOM_CTA_CLASS } from "../bottomCta";
import { groupFieldError, isOverGroupLimit } from "../fieldError";
import { countGroupText } from "../model/limits";

const PAGE_CLASS = "theme-soft-blue page-column flex min-h-dvh flex-col text-foreground";

/** 그룹 이름, 닉네임, 쓰는 글이 Amplitude 클릭 이벤트에 실리지 않게 화면 안의 글자와 aria-label을 모두 가린다. */
const ANALYTICS_MASK = { "data-amp-mask": true, "data-amp-mask-attributes": "aria-label" };

const SUBMIT_TONE_CLASS = {
  primary: undefined,
  danger: "bg-feedback-danger text-white",
} as const;

/**
 * 신청 소개 글과 신고 사유를 쓰는 전체 화면
 *
 * 입력이 있는 바텀 시트는 iOS에서 키보드가 올라올 때 화면이 밀리고 흔들려서 전체 화면으로 연다.
 * 한도에서 입력을 자르면 iOS 한글 자판이 앞 글자를 덮어써서 글은 자르지 않고 보내기만 막는다.
 * 연락처·링크는 판정의 원본이 서버라 안내만 하고 보내기는 막지 않는다.
 * 서버가 막은 문장도 같은 줄에 보이고, 글을 고치면 호출부가 비운다.
 * 공부방 위에 겹쳐 뜨는 화면은 앱의 유리 머리 줄을 띄우면 안 되어서 머리 줄은 화면마다 받는다.
 */
export function WriteScreen({
  tone,
  header,
  headline,
  description,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  required,
  checkContact,
  notice,
  submitLabel,
  submitTone,
  pending,
  serverError = null,
  onSubmit,
}: {
  tone: "light" | "dark";
  /** 밝은 화면은 뒤로 가기 줄을, 공부방 위 화면은 웹이 그리는 뒤로 버튼과 제목을 넘긴다. */
  header: ReactNode;
  headline: string;
  description: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;
  required: boolean;
  checkContact: boolean;
  notice: string;
  submitLabel: string;
  submitTone: "primary" | "danger";
  /** 보내는 중이면 버튼을 막아 같은 글이 두 번 나가지 않는다. */
  pending: boolean;
  /** 서버가 글을 받지 않은 이유이고, 글자 수 안내 다음이자 입력 중의 연락처 안내 대신 보인다. */
  serverError?: string | null;
  onSubmit: () => void;
}) {
  const inputId = useId();
  const countId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const keyboardInset = useKeyboardInset();
  const length = countGroupText(value);
  const error = groupFieldError(value, maxLength, checkContact, serverError);
  // 앞뒤 공백을 뺀 글자 수로 세어 공백만 쓴 글도 비어 있는 글로 본다.
  const missing = required && length === 0;

  // 쓰려고 연 화면이라 열리자마자 입력칸에 커서를 둔다.
  // iOS는 키보드를 올리며 포커스를 받은 입력칸 쪽으로 문서를 끌어 올려서 머리 제목이 앱의 머리 줄 밑으로 들어가므로 문서는 움직이지 않게 한다.
  // iOS는 연 순간에 준 포커스로도 키보드를 올리고 그 포커스가 남으면 입력칸을 누를 때 문서가 끌어 올려지므로, iOS에서는 연 순간에 포커스를 주지 않는다.
  useEffect(() => {
    if (isIosWeb()) return;
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // 라벨을 누르면 브라우저가 옵션 없이 입력칸에 포커스를 주어 iOS에서 문서가 끌어 올려지므로 같은 누름 안에서 먼저 준다.
  // 이미 포커스가 있으면 커서 옮기기라 그대로 둔다.
  const focusInputFromLabel = (event: MouseEvent<HTMLLabelElement>) => {
    if (document.activeElement === inputRef.current) return;
    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
  };

  const body = (
    <>
      {header}
      <div className="flex flex-col px-5">
        <h2 className="pt-4.5 text-xl leading-7 font-bold text-foreground">{headline}</h2>
        <p className="pt-1.5 text-sm leading-5 break-keep text-muted-foreground">{description}</p>
        <label
          htmlFor={inputId}
          onMouseDown={isIosWeb() ? focusInputFromLabel : undefined}
          className="pt-5.5 text-sm leading-5 font-bold text-foreground"
        >
          {label}
        </label>
        <div className="mt-2 flex flex-col items-end gap-1.5 rounded-lg border border-border bg-muted px-3.5 pt-3 pb-2.5 focus-within:ring-2 focus-within:ring-(--state-focus)">
          <textarea
            ref={inputRef}
            onMouseDown={isIosWeb() ? focusWithoutScrollOnPress : undefined}
            id={inputId}
            rows={3}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-invalid={error !== null || undefined}
            aria-describedby={error !== null ? `${errorId} ${countId}` : countId}
            className="min-h-16.5 w-full resize-none bg-transparent text-[15px] leading-5.5 text-foreground outline-none placeholder:text-state-pause"
          />
          <CharCount
            id={countId}
            length={length}
            max={maxLength}
            className="leading-4 text-muted-foreground"
          />
        </div>
        {error !== null && (
          <p
            id={errorId}
            role="alert"
            className="pt-2 text-[13px] leading-5 text-state-distract-text"
          >
            {error}
          </p>
        )}
        <p className="flex items-center gap-1.5 pt-2.5 text-[13px] leading-5 break-keep text-muted-foreground">
          <Info aria-hidden="true" size={15} className="shrink-0" />
          {notice}
        </p>
        {/* 아래 버튼이 화면에 떠 있어서 내용 끝이 버튼에 가리지 않게 버튼 높이와 위아래 간격만큼 비운다. */}
        <div aria-hidden="true" className="h-[calc(env(safe-area-inset-bottom)+104px)] shrink-0" />
      </div>
      <div
        data-testid="write-submit-bar"
        data-keyboard-inset={keyboardInset}
        // 보내는 버튼은 키보드 바로 위에 붙어야 해서 하단 고정 금지 규칙의 예외로 fixed를 쓴다.
        style={keyboardInset > 0 ? { bottom: keyboardInset + 12 } : undefined}
        className={cn(
          "fixed inset-x-0 z-20 px-5 page-width",
          keyboardInset === 0 && "bottom-[calc(env(safe-area-inset-bottom)+24px)]",
        )}
      >
        <Button
          size="xl"
          disabled={pending || isOverGroupLimit(value, maxLength) || missing}
          onClick={onSubmit}
          className={cn(BOTTOM_CTA_CLASS, SUBMIT_TONE_CLASS[submitTone])}
        >
          {submitLabel}
        </Button>
      </div>
    </>
  );

  if (tone === "dark") {
    // 공부방 화면의 main 위에 겹쳐 뜨므로 main을 또 두지 않는다.
    // 앱 테마와 상관없이 어둡게 그리되, 빨간 버튼 색이 Soft Blue 팔레트에만 있어 어두운 바탕 안에 Soft Blue를 한 겹 더 둔다.
    return (
      <div data-testid="write-screen" data-tone="dark" className="theme-dark" {...ANALYTICS_MASK}>
        <div className={cn(PAGE_CLASS, "bg-background")}>{body}</div>
      </div>
    );
  }
  return (
    <main
      data-testid="write-screen"
      data-tone="light"
      className={cn(PAGE_CLASS, "bg-soft-blue")}
      {...ANALYTICS_MASK}
    >
      {body}
    </main>
  );
}
