import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { EarnIcon } from "./EarnIcon";

/** 출석·하루 목표·광고가 같이 쓰는 세로 타일이며 아래 칸에 상태나 버튼을 받는다. */
export function FreeTile({
  icon,
  label,
  count,
  reward,
  note,
  children,
}: {
  icon: "attendance" | "dailyGoal" | "ad";
  label: string;
  count?: string;
  reward?: string;
  /** 보상 아래에 붙는 작은 강조 줄 */
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-lg bg-bg-layer-2 px-2 pt-3 pb-2 text-center">
      <EarnIcon name={icon} />
      <span className="mt-0.5 max-w-full text-xs break-keep text-muted-foreground">
        {label}
        {count !== undefined && <span className="ml-1 font-bold text-primary">{count}</span>}
      </span>
      {reward !== undefined && (
        <span className="text-base font-extrabold tabular-nums">{reward}</span>
      )}
      {note !== undefined && (
        <span className="max-w-full text-[11px] leading-tight font-semibold break-keep text-primary">
          {note}
        </span>
      )}
      <div className="mt-auto flex w-full flex-col items-center gap-1 pt-1.5">{children}</div>
    </div>
  );
}

const ACTION_CLASS =
  "relative flex h-8 max-w-full items-center justify-center rounded-full px-5 text-[13px] font-bold break-keep before:absolute before:-inset-x-1 before:-inset-y-1.5 disabled:opacity-60";

/** 타일 아래의 작은 알약 버튼. 보이는 높이는 낮추고 누르는 범위는 위아래로 넓힌다. */
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
      className={`${ACTION_CLASS} ${quiet ? "bg-muted text-muted-foreground" : "bg-brand-subtle text-primary"}`}
    >
      {children}
    </button>
  );
}

/** 이미 받은 타일 아래의 완료 표시 */
export function TileDone({ label }: { label: string }) {
  return (
    <span className="flex h-8 items-center justify-center gap-1 text-[13px] font-bold text-feedback-success">
      <Check aria-hidden="true" size={14} strokeWidth={3} />
      {label}
    </span>
  );
}
