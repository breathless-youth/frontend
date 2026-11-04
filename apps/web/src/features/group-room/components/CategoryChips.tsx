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
 * 기본 여백으로는 전체를 포함한 한국어 칩 열 개가 두 줄에 들어가려면 묶음 폭이 335px 이상이어야 해서, 여유를 두고 345px보다 좁으면 칩의 좌우 여백을 줄인다.
 * 화면 폭이 아니라 묶음 폭을 보므로 이 칩을 쓰는 어느 화면에서나 같게 줄어든다.
 * 여백을 줄여도 영어 `All` 같은 짧은 칩이 누르기 좋은 폭 밑으로 좁아지지 않게 최소 폭을 둔다.
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
    <div
      role="group"
      aria-label={t("categoryChips.aria.group")}
      className="@container flex flex-wrap gap-1.5"
    >
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          aria-pressed={chip.value === value}
          onClick={() => pick(chip.value)}
          className="relative h-9 min-w-11 shrink-0 rounded-full border border-border bg-muted px-3.5 text-sm leading-4 font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground @max-[345px]:px-2.75"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
