import { useId } from "react";
import { useTranslation } from "react-i18next";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

import { BOTTOM_CTA_BAR_CLASS, BOTTOM_CTA_CLASS } from "../bottomCta";
import { INVITE_CODE_CELL_CLASS, INVITE_CODE_ROW_CLASS } from "../inviteCodeCell";
import { INVITE_CODE_LENGTH, isCompleteInviteCode, normalizeInviteCode } from "../model/inviteCode";

const SLOT_INDEXES = Array.from({ length: INVITE_CODE_LENGTH }, (_, index) => index);

/**
 * 6자리 초대코드로 그룹에 참여
 *
 * 영문과 숫자를 받으므로 숫자 자판 대신 글자 자판을 열고 대문자로 받는다.
 * 입력 부품이 붙여 넣은 글을 칸 수로 먼저 자르므로 자르기 전에 공백과 구분 기호를 빼고 대문자로 맞추고, 온전한 코드를 붙여 넣으면 있던 코드를 통째로 바꾼다.
 * 참여할 수 없는 이유는 칸 아래 한 문장으로만 알리고, 오류가 없을 때는 칸 아래에 안내 줄을 두지 않는다.
 */
export function InviteCodeEntryScreen({
  value,
  onChange,
  error,
  pending,
  onSubmit,
  onBack,
}: {
  value: string;
  onChange: (code: string) => void;
  /** 서버가 참여를 받지 않은 이유이고, 코드를 고치면 호출부가 비운다. */
  error: string | null;
  /** 참여를 보내는 중이면 버튼을 막아 같은 요청이 두 번 나가지 않는다. */
  pending: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("group-room");
  const headlineId = useId();
  const errorId = useId();
  const change = (next: string) => {
    const code = normalizeInviteCode(next);
    onChange(code);
    // 여섯 자리가 차면 키보드를 내려 아래의 참여하기 버튼과 오류 줄이 가리지 않게 한다.
    if (isCompleteInviteCode(code) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader title={t("inviteCodeEntryScreen.title")} onBack={onBack} />
      <div className="flex grow flex-col items-center justify-center gap-2 px-5 pb-6 text-center">
        <h2 id={headlineId} className="text-lg leading-6.5 font-bold text-foreground">
          {t("inviteCodeEntryScreen.prompt")}
        </h2>
        <div aria-hidden="true" className="h-2" />
        <InputOTP
          maxLength={INVITE_CODE_LENGTH}
          value={value}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-labelledby={headlineId}
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? errorId : undefined}
          pasteTransformer={normalizeInviteCode}
          containerClassName={INVITE_CODE_ROW_CLASS}
          onChange={change}
          // 입력 부품은 붙여 넣은 글을 커서 자리에 끼워 넣어서 채워진 칸에 새 코드를 넣으면 두 코드가 섞인다.
          // 붙여 넣은 글이 온전한 코드면 부품이 끼워 넣은 값 대신 그 코드로 통째로 바꾼다.
          onPaste={(event) => {
            const pasted = normalizeInviteCode(event.clipboardData.getData("text/plain"));
            if (isCompleteInviteCode(pasted)) {
              event.preventDefault();
              change(pasted);
            }
          }}
        >
          {SLOT_INDEXES.map((index) => (
            <InputOTPSlot key={index} index={index} className={INVITE_CODE_CELL_CLASS} />
          ))}
        </InputOTP>
        {error !== null && (
          <>
            <div aria-hidden="true" className="h-1" />
            <p
              id={errorId}
              role="alert"
              className="text-sm leading-5 font-semibold text-state-distract-text"
            >
              {error}
            </p>
          </>
        )}
      </div>
      <div className={BOTTOM_CTA_BAR_CLASS}>
        <Button
          size="xl"
          disabled={pending || !isCompleteInviteCode(value)}
          onClick={() => {
            // 키보드가 열린 채 보내면 결과와 오류 줄을 키보드가 가려서 먼저 내린다.
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            onSubmit();
          }}
          className={cn(BOTTOM_CTA_CLASS, "shadow-sb-cta disabled:shadow-none")}
        >
          {t("inviteCodeEntryScreen.submit")}
        </Button>
      </div>
    </main>
  );
}
