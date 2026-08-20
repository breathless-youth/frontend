import { sanitizeInviteCode } from "./inviteCode";

/**
 * 초대코드 4칸 입력
 *
 * **보이지 않는 단일 `<input>` + 표시용 4칸** 구조다 — input 4개를 동기화(포커스 이동·백스페이스·
 * 붙여넣기 분배)하는 대신, 브라우저 기본 동작을 그대로 얻는 최소 구현. 표시 칸은 `aria-hidden`이고
 * 스크린리더·키보드는 input 하나만 상대한다.
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
    <div className="relative">
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
        폰트 16px 미만이면 iOS가 포커스 시 화면을 확대한다 — 투명해도 폰트는 크게 둔다.
        caret·텍스트는 opacity-0으로 숨기고 터치·포커스만 받는다.
      */}
      <input
        type="text"
        inputMode="numeric"
        pattern="\d*"
        autoComplete="one-time-code"
        maxLength={4}
        value={value}
        onChange={(event) => {
          onChange(sanitizeInviteCode(event.target.value));
        }}
        aria-label="초대코드 4자리"
        aria-describedby={errorId}
        className="absolute inset-0 w-full text-2xl opacity-0"
      />
    </div>
  );
}
