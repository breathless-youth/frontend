import { InputOTP, InputOTPSlot } from "@/components/ui/input-otp";

import { CODE_CELL_CLASS } from "./codeCell";
import { isCompleteInviteCode, sanitizeInviteCode } from "./inviteCode";

/**
 * 초대코드 4칸 입력
 *
 * 값은 항상 string이다 — 앞자리 0 보존
 */
type InviteCodeInputProps = {
  value: string;
  onChange: (code: string) => void;
  errorId?: string;
};

export function InviteCodeInput({ value, onChange, errorId }: InviteCodeInputProps) {
  return (
    <InputOTP
      maxLength={4}
      value={value}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label="초대코드 4자리"
      aria-invalid={errorId !== undefined || undefined}
      aria-describedby={errorId}
      // input-otp가 maxLength=4를 붙여넣기 원문에 먼저 적용해 sanitize 전에 잘라버린다
      // ("코드: 3712" → "코드:"). pasteTransformer로 sanitize를 붙여넣기 시점에 먼저 태운다.
      pasteTransformer={sanitizeInviteCode}
      onChange={(next) => {
        const sanitized = sanitizeInviteCode(next);
        onChange(sanitized);
        // 4자리가 채워지면 키보드를 내린다 — 타이핑뿐 아니라 붙여넣기·자동완성으로
        // 한 번에 4자리가 들어와도 input-otp의 붙여넣기 처리가 같은 onChange를 탄다.
        // (input-otp의 onComplete는 controlled value prop이 다음 렌더에 반영돼야
        // 트리거된다 — 여기서 직접 판정하면 이벤트 안에서 즉시 처리된다.)
        if (isCompleteInviteCode(sanitized) && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }}
    >
      <InputOTPSlot index={0} className={CODE_CELL_CLASS} />
      <InputOTPSlot index={1} className={CODE_CELL_CLASS} />
      <InputOTPSlot index={2} className={CODE_CELL_CLASS} />
      <InputOTPSlot index={3} className={CODE_CELL_CLASS} />
    </InputOTP>
  );
}
