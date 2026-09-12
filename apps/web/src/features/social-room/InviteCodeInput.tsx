import { useRef } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className="relative block"
      onClick={(event) => {
        event.preventDefault();
        inputRef.current?.focus({ preventScroll: true });
      }}
    >
      <div aria-hidden="true" className="flex gap-2.5">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            data-testid="invite-code-cell"
            className={`flex h-[60px] w-[50px] items-center justify-center rounded-[14px] bg-invite-surface text-2xl font-bold text-invite-surface-text ${
              index === value.length ? "ring-2 ring-primary" : ""
            }`}
          >
            {value[index] ?? ""}
          </div>
        ))}
      </div>
      {/*
        안드로이드 WebView는 삽입 핸들(물방울)을 select-none·text-indent로 숨겨도 input 박스의
        보이는 왼쪽 끝에 clamp해 그린다 — 박스 자체를 화면 밖(left: -9999px)으로 빼서 핸들이
        그려질 좌표를 화면 밖으로 보낸다. 탭 대상은 위 표시용 4칸이고, label의 onClick이
        preventDefault 후 preventScroll 포커스로 이 input을 직접 연다(label 기본 동작은 화면
        밖 input으로 스크롤을 유발할 수 있다). 탭이 사용자 제스처이므로 키보드는 정상적으로 뜬다.

        폰트 16px 미만이면 iOS가 포커스 시 화면을 확대한다 — 화면 밖이어도 폰트는 크게 둔다.

        caret-transparent가 opacity-0과 별도로 필요한 이유: 안드로이드(Chromium)는 caret을
        요소 투명도와 무관하게 네이티브 레이어에 그려서, 화면 밖 input이어도 caret이 그 좌표에
        노출될 수 있다. 입력 위치 표시는 위 링(ring)이 담당한다.
      */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        autoComplete="one-time-code"
        maxLength={4}
        value={value}
        onChange={(event) => {
          const next = sanitizeInviteCode(event.target.value);
          // 4자리가 완성되면 키보드를 내린다 — 타이핑뿐 아니라 붙여넣기·one-time-code
          // 자동완성으로 한 번에 4자리가 들어와도 동작한다. 자동 제출은 하지 않는다
          // (참여는 버튼으로만 확정 — 사용자 결정, BY-427).
          if (isCompleteInviteCode(next)) {
            inputRef.current?.blur();
          }
          onChange(next);
        }}
        aria-label="초대코드 4자리"
        aria-invalid={errorId !== undefined || undefined}
        aria-describedby={errorId}
        className="absolute top-0 left-[-9999px] h-px w-px select-none caret-transparent text-2xl opacity-0 [-webkit-touch-callout:none]"
      />
    </label>
  );
}
