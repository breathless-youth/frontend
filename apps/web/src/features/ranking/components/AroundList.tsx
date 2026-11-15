import type { RankingType } from "@focusmakers/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

import { formatValue } from "../model/format";
import { formatRankChange, type LiveRow, type RankChangeTone } from "../model/live";
import { Nickname } from "./Nickname";
import { RankAvatar } from "./RankAvatar";

const ROW_PX = 50;
const MOTION_MS = 300;
/** 나간 줄이 사라지는 시간이자 새 줄이 기다렸다 나타나는 시간. */
const FADE_MS = 150;
/** Tailwind `ease-out`과 같은 곡선. */
const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";

const CHANGE_TONE_CLASS: Record<RankChangeTone, string> = {
  rise: "text-rank-rise",
  drop: "text-rank-alert-badge-fg",
  same: "text-text-tertiary",
};

interface Placed {
  row: LiveRow;
  top: number;
}

/**
 * 창 밖으로 나간 줄
 *
 * 폴링으로 줄이 바뀌면 사라진 줄을 마지막 자리에 잠깐 남겨 투명도로 지운다.
 * 모션 줄이기면 남기지 않는다.
 */
function useLeavingRows(rows: readonly LiveRow[]): Placed[] {
  const signature = rows.map((row) => row.nickname).join("\n");
  const [previous, setPrevious] = useState({ signature, rows });
  const [leaving, setLeaving] = useState<Placed[]>([]);

  if (previous.signature !== signature) {
    const names = new Set(rows.map((row) => row.nickname));
    const gone = previous.rows.flatMap((row, index) =>
      names.has(row.nickname) ? [] : [{ row, top: index * ROW_PX }],
    );
    setPrevious({ signature, rows });
    setLeaving(prefersReducedMotion() ? [] : gone);
  }

  useEffect(() => {
    if (leaving.length === 0) {
      return;
    }
    const id = window.setTimeout(() => setLeaving([]), MOTION_MS);
    return () => window.clearTimeout(id);
  }, [leaving]);

  return leaving;
}

/**
 * 줄 움직임
 *
 * 순서가 바뀌면 React가 줄 하나를 DOM의 다른 자리에 다시 붙인다.
 * 다시 붙은 줄은 CSS 전환이 끊기고 CSS 등장 애니메이션이 처음부터 다시 돈다.
 * 그래서 커밋 뒤에 Web Animations로 직접 움직인다.
 * 새 줄은 나타나고, 자리가 바뀐 줄은 직전 자리에서 미끄러지고, 나간 줄은 사라진다.
 * 같은 자리에서 나간 줄과 새 줄의 글자가 겹치지 않게, 나간 줄이 사라진 뒤에 새 줄이 나타난다.
 * 모션 줄이기면 움직이지 않는다.
 */
function useRowMotion(top: number, leaving: boolean) {
  const ref = useRef<HTMLLIElement>(null);
  const shownTop = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const from = shownTop.current;
    shownTop.current = top;
    if (element === null || typeof element.animate !== "function" || prefersReducedMotion()) {
      return;
    }
    if (leaving) {
      element.animate(
        { opacity: [1, 0] },
        { duration: FADE_MS, easing: EASE_OUT, fill: "forwards" },
      );
    } else if (from === null) {
      // 기다리는 동안에도 투명하게 둔다.
      element.animate(
        { opacity: [0, 1] },
        { duration: FADE_MS, delay: FADE_MS, easing: EASE_OUT, fill: "backwards" },
      );
    } else if (from !== top) {
      element.animate(
        { transform: [`translateY(${from}px)`, `translateY(${top}px)`] },
        { duration: MOTION_MS, easing: EASE_OUT },
      );
    }
  }, [top, leaving]);

  return ref;
}

/**
 * 내 주변 순위 목록
 *
 * 줄은 닉네임을 key로 두고 세로 위치를 transform으로 바꿔, 순서가 바뀌면 300ms 동안 미끄러진다.
 * 순위 숫자는 참여 인원을 드러내 쓰지 않는다.
 * `change`가 있으면 모든 줄 앞에 같은 폭의 변동 칸을 두어 아바타 세로줄을 맞추고, 글자는 내 줄에만 쓴다.
 * `change`가 `undefined`면 변동을 보이지 않는 판이라 칸을 두지 않고, `null`이면 기준선이 없어 칸을 비운다.
 * 변동 글자는 보이는 글자와 별개로 status 영역에 바뀔 때 한 번 읽히게 둔다.
 */
export function AroundList({
  type,
  rows,
  change,
}: {
  type: RankingType;
  rows: readonly LiveRow[];
  change?: number | null;
}) {
  const leaving = useLeavingRows(rows);
  const { t } = useTranslation("ranking");
  const spoken = change == null ? null : formatRankChange(change).spoken;
  return (
    <section
      aria-label={t("around.aria.label")}
      className="rounded-xl bg-muted px-2 py-1.5 shadow-sb-card"
    >
      <ol className="relative" style={{ height: rows.length * ROW_PX }}>
        {rows.map((row, index) => (
          <AroundRow
            key={row.nickname}
            row={row}
            type={type}
            top={index * ROW_PX}
            change={change === undefined ? undefined : row.me ? change : null}
          />
        ))}
        {leaving.map(({ row, top }) => (
          <AroundRow
            key={`leaving-${row.nickname}`}
            row={row}
            type={type}
            top={top}
            change={change === undefined ? undefined : null}
            leaving
          />
        ))}
      </ol>
      <p role="status" className="sr-only">
        {spoken === null ? "" : t("around.status", { change: spoken })}
      </p>
    </section>
  );
}

function AroundRow({
  row,
  type,
  top,
  change,
  leaving = false,
}: {
  row: LiveRow;
  type: RankingType;
  top: number;
  change: number | null | undefined;
  leaving?: boolean;
}) {
  const shownChange = change == null ? null : formatRankChange(change);
  const ref = useRowMotion(top, leaving);
  const { t } = useTranslation("ranking");
  return (
    <li
      ref={ref}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
      aria-current={row.me && !leaving ? "true" : undefined}
      className="absolute inset-x-0 top-0 flex h-12.5 items-center"
      style={{ transform: `translateY(${top}px)` }}
    >
      <div
        className={cn(
          "flex h-11.5 w-full items-center gap-3 rounded-[14px] px-3",
          row.me && "bg-brand-subtle",
        )}
      >
        {change !== undefined && (
          // ponytail: 칸은 24px로 고정해 세 자리 계단(▲100)부터는 글자가 아바타 쪽 간격으로 넘친다.
          <span
            aria-hidden="true"
            className={cn(
              "w-6 shrink-0 text-[13px] leading-3.75 font-extrabold whitespace-nowrap tabular-nums",
              shownChange && CHANGE_TONE_CLASS[shownChange.tone],
            )}
          >
            {shownChange?.text}
          </span>
        )}
        <RankAvatar me={row.me} imageUrl={row.profileImageUrl} />
        <div className="min-w-0 flex-1">
          <Nickname
            name={row.nickname}
            className={cn(
              "text-sm leading-4",
              row.me ? "font-extrabold" : "font-semibold text-foreground",
            )}
          />
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-[15px] leading-4.5 tracking-[0.5px] tabular-nums",
            row.me ? "font-extrabold" : "font-bold text-foreground",
          )}
        >
          {row.focusing && (
            <>
              <span
                aria-hidden="true"
                className="size-1.5 animate-pulse rounded-full bg-feedback-success motion-reduce:animate-none"
              />
              <span className="sr-only">{t("row.focusing")}</span>
            </>
          )}
          {formatValue(type, row.display)}
        </span>
      </div>
    </li>
  );
}
