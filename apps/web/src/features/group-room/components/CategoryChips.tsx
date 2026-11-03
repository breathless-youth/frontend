import { useTranslation } from "react-i18next";

import type { CategoryOption } from "../types";

/**
 * `allLabel` 유무에 따른 고른 값의 모양
 *
 * 조건 없음 칩이 있을 때만 `null`을 넘기고, 없으면 늘 값이 있어 그룹 만들기 같은 호출부가 `null`을 거르지 않아도 된다.
 */
type CategoryChipsProps = {
  options: CategoryOption[];
  value: string | null;
} & (
  | { allLabel: string; onChange: (value: string | null) => void }
  | { allLabel?: undefined; onChange: (value: string) => void }
);

/**
 * 시험·목표 칩 묶음
 *
 * 하나만 고르고, 눌린 칩을 다시 눌러도 풀지 않아 늘 하나가 골라져 있다.
 * `allLabel`이 있으면 맨 앞에 조건 없음(`null`) 칩을 둔다.
 * Radix 토글 묶음은 눌린 칩을 다시 누르면 빈 값으로 풀고 라디오로 읽혀서, 누름 상태를 가진 버튼으로 직접 만든다.
 * 가로로 넘기지 않고 줄을 바꿔 모든 칩이 한눈에 보이게 하고, 보이는 높이 36px에 누르는 영역을 위아래로 넓혀 44px로 맞춘다.
 */
export function CategoryChips(props: CategoryChipsProps) {
  const { t } = useTranslation("group-room");
  const { options, value, allLabel } = props;
  const chips: { value: string | null; label: string }[] =
    allLabel === undefined ? options : [{ value: null, label: allLabel }, ...options];

  const pick = (next: string | null) => {
    if (next === value) {
      return;
    }
    if (props.allLabel !== undefined) {
      props.onChange(next);
    } else if (next !== null) {
      props.onChange(next);
    }
  };

  return (
    <div role="group" aria-label={t("categoryChips.aria.group")} className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          aria-pressed={chip.value === value}
          onClick={() => pick(chip.value)}
          className="relative h-9 shrink-0 rounded-full border border-border bg-muted px-3.5 text-sm leading-4 font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
