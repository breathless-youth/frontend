import type { ReactNode } from "react";

import { EarnIcon } from "./EarnIcon";

/** 출석·하루 목표·광고가 같이 쓰는 세로 타일이며 아래 칸에 상태나 버튼을 받는다. */
export function FreeTile({
  icon,
  label,
  count,
  reward,
  children,
}: {
  icon: "attendance" | "dailyGoal" | "ad";
  label: string;
  count?: string;
  reward: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-lg bg-bg-layer-2 px-2 pt-3 pb-2 text-center">
      <EarnIcon name={icon} />
      <span className="mt-0.5 text-xs break-keep text-muted-foreground">
        {label}
        {count !== undefined && <span className="ml-1 font-bold text-primary">{count}</span>}
      </span>
      <span className="text-base font-extrabold tabular-nums">{reward}</span>
      <div className="mt-auto flex w-full flex-col gap-1 pt-1.5">{children}</div>
    </div>
  );
}

const ACTION_CLASS =
  "flex min-h-11 w-full items-center justify-center rounded-md px-1.5 text-[13px] font-bold break-keep disabled:opacity-60";

/** 타일 아래의 누르는 버튼. 강조는 브랜드색 채움, 아니면 옅은 바탕이다. */
export function TileButton({
  children,
  onClick,
  disabled,
  quiet = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${ACTION_CLASS} ${quiet ? "bg-brand-subtle text-primary" : "bg-primary text-primary-foreground"}`}
    >
      {children}
    </button>
  );
}

/** 이미 받은 타일 아래의 완료 표시 */
export function TileDone({ label }: { label: string }) {
  return (
    <span className="flex min-h-11 items-center justify-center rounded-md bg-muted text-[13px] font-bold text-feedback-success">
      <span aria-hidden="true">✓ </span>
      {label}
    </span>
  );
}
