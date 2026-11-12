import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { EarnIcon } from "./EarnIcon";

/** 출석·하루 목표·광고가 같이 쓰는 가로 줄이며 오른쪽 칸에 상태나 버튼을 받는다. */
export function FreeTile({
  icon,
  label,
  reward,
  note,
  children,
}: {
  icon: "attendance" | "dailyGoal" | "ad";
  label: string;
  reward?: string;
  /** 이름 아래에 붙는 작은 강조 줄 */
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-bg-layer-2 px-3 py-2">
      <EarnIcon name={icon} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-bold break-keep">
          {label}
          {reward !== undefined && (
            <span className="ml-1.5 font-extrabold text-primary tabular-nums">{reward}</span>
          )}
        </span>
        {note !== undefined && (
          <span className="text-[11px] leading-tight font-semibold break-keep text-primary">
            {note}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">{children}</div>
    </div>
  );
}

// 줄 배경에 묻히지 않을 만큼만 진한 연한 파랑 바탕에, 작은 글자가 읽히게 한 단계 어두운 파랑 글자를 쓴다.
const SOFT_CLASS =
  "bg-primary/15 text-[color-mix(in_srgb,var(--primary)_80%,black)] dark:text-primary";

const ACTION_CLASS =
  "relative flex h-8 max-w-full items-center justify-center rounded-full px-5 text-[13px] font-bold break-keep before:absolute before:-inset-x-1 before:-inset-y-1.5 disabled:opacity-60";

/** 줄 오른쪽의 작은 알약 버튼. 보이는 높이는 낮추고 누르는 범위는 위아래로 넓힌다. */
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
      className={`${ACTION_CLASS} ${quiet ? "bg-muted text-muted-foreground" : SOFT_CLASS}`}
    >
      {children}
    </button>
  );
}

/** 이미 받은 줄 오른쪽의 완료 표시이며 버튼과 같은 크기의 알약이라 줄마다 오른쪽 끝이 맞는다. */
export function TileDone({ label }: { label: string }) {
  return (
    <span className="flex h-8 items-center justify-center gap-1 rounded-full bg-muted px-4 text-[13px] font-bold text-feedback-success">
      <Check aria-hidden="true" size={14} strokeWidth={3} />
      {label}
    </span>
  );
}
