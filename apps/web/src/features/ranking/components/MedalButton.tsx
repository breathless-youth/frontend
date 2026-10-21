import { cn } from "@/lib/utils";

import { IllustMedal } from "../icons";

/**
 * 겹친 금·은·동 메달과 받은 메달 수
 *
 * 0개면 메달을 흐리게 그린다.
 * 테두리·그림자와 오른쪽 `›`로 누르면 기록이 열리는 버튼이라는 것을 보인다.
 * 누르는 영역은 44px이고, 좁은 화면에서 버튼 밑까지 오는 칩의 누르는 영역과 겹치지 않게 위로 더 넓힌다.
 * 넓히는 기준이 테두리 안쪽이라 넓히는 값에 테두리 1px을 위아래로 더한다.
 */
export function MedalButton({ total, onClick }: { total: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={total === null ? "랭킹 기록" : `랭킹 기록, 메달 ${total}개`}
      className="relative flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted pr-2 pl-2.5 shadow-sb-card before:absolute before:inset-x-0 before:-top-3.75 before:-bottom-0.75 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--state-focus)"
    >
      <span className={cn("flex", total === 0 && "opacity-45")}>
        {([1, 2, 3] as const).map((rank, index) => (
          <IllustMedal
            key={rank}
            rank={rank}
            size={16}
            numbered={false}
            className={cn(index > 0 && "-ml-1.75")}
          />
        ))}
      </span>
      {total !== null && (
        <span
          className={cn(
            "text-[13px] leading-3.75 font-extrabold tabular-nums",
            total === 0 ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {total}
        </span>
      )}
      <span aria-hidden="true" className="text-[15px] leading-none font-bold text-muted-foreground">
        ›
      </span>
    </button>
  );
}
