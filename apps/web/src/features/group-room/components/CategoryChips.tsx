import { useLayoutEffect, useRef } from "react";
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
  compact?: boolean;
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
 * 누르는 영역은 테두리 안쪽에서 시작하므로 칩 위아래로 4px씩 넓히려면 테두리 1px을 더해 5px을 줘야 한다.
 * 줄 사이 간격보다 영역이 넓어 아래 줄 칩과 2px 겹치고, 겹친 띠를 누르면 아래 줄 칩이 눌린다.
 * 기본 여백으로는 전체를 포함한 한국어 칩 열 개가 두 줄에 들어가려면 묶음 폭이 335px 이상이어야 해서, 여유를 두고 345px보다 좁으면 칩의 좌우 여백을 줄인다.
 * 줄인 여백으로도 두 줄에 들어가려면 305px 이상이어야 해서, 305px보다 좁으면 글자를 13px로 줄이고 좌우 여백과 최소 폭을 한 번 더 줄인다.
 * 화면 폭이 아니라 묶음 폭을 보므로 이 칩을 쓰는 어느 화면에서나 같게 줄어든다.
 * 최소 폭은 영어 `All` 같은 짧은 칩이 누르기 좋은 폭 밑으로 좁아지지 않게 두고, 305px보다 좁을 때만 두 줄에 넣으려고 40px로 낮춘다.
 */
export function CategoryChips(props: CategoryChipsProps) {
  const { t } = useTranslation("group-room");
  const { options, value, allLabel, compact = false } = props;
  let chips: { value: string | null; label: string }[] =
    allLabel === undefined ? options : [{ value: null, label: allLabel }, ...options];

  if (compact && value !== null && allLabel !== undefined) {
    const selected = chips.find((chip) => chip.value === value);
    if (selected)
      chips = [chips[0]!, selected, ...chips.slice(1).filter((chip) => chip.value !== value)];
  }

  const groupRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const update = () => {
      const buttons = Array.from(group.querySelectorAll("button"));
      const top = buttons[0]?.offsetTop ?? 0;
      for (const button of buttons) {
        const hidden = compact && button.offsetTop - top >= 78;
        button.toggleAttribute("inert", hidden);
        if (hidden) button.setAttribute("aria-hidden", "true");
        else button.removeAttribute("aria-hidden");
      }
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(group);
    return () => observer.disconnect();
  }, [compact, options, value]);

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
      ref={groupRef}
      role="group"
      aria-label={t("categoryChips.aria.group")}
      className={
        compact
          ? "@container flex max-h-[78px] min-w-0 flex-wrap gap-1.5 overflow-hidden"
          : "@container flex flex-wrap gap-1.5"
      }
    >
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          aria-pressed={chip.value === value}
          onClick={() => pick(chip.value)}
          className="relative h-9 min-w-11 shrink-0 rounded-full border border-border bg-muted px-3.5 text-sm leading-4 font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-1.25 before:content-[''] focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground @max-[345px]:px-2.75 @max-[305px]:min-w-10 @max-[305px]:px-2 @max-[305px]:text-[13px]"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
