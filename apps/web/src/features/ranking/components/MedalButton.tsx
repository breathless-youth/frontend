import { cn } from "@/lib/utils";

import { IllustMedal } from "../icons";

/**
 * 겹친 금·은·동 메달과 받은 메달 수
 *
 * 0개면 메달을 흐리게 그린다.
 * 누르는 영역은 44px이고, 7px 아래 기간 칸의 누르는 영역과 겹치지 않게 위로 더 넓힌다.
 */
export function MedalButton({ total, onClick }: { total: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={total === null ? "랭킹 기록" : `랭킹 기록, 메달 ${total}개`}
      className="relative flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 before:absolute before:inset-x-0 before:-top-3.5 before:-bottom-0.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)]"
    >
      <span className={cn("flex", total === 0 && "opacity-45")}>
        {([1, 2, 3] as const).map((rank, index) => (
          <IllustMedal
            key={rank}
            rank={rank}
            size={16}
            numbered={false}
            className={cn(index > 0 && "-ml-[7px]")}
          />
        ))}
      </span>
      {total !== null && (
        <span
          className={cn(
            "text-[13px] leading-[15px] font-extrabold tabular-nums",
            total === 0 ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {total}
        </span>
      )}
    </button>
  );
}
