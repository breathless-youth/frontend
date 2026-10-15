import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { IllustCrown, IllustMedal } from "../icons";
import { formatRank } from "../model/format";
import type { MedalModalView, MedalStack } from "./medalView";

/**
 * 마감 메달 모달
 *
 * 버튼으로만 닫히는 안내라 공지 모달처럼 Esc와 바깥 탭을 막는다.
 * 본문은 body로 포털돼 홈의 테마 범위를 벗어나므로 Soft Blue 테마를 직접 단다.
 * 메달이 하나면 기록 한 줄을, 여럿이면 앞 3개 목록과 나머지 개수를 보인다.
 */
export function MedalModal({
  view,
  open,
  onRecords,
  onClose,
}: {
  view: MedalModalView;
  open: boolean;
  onRecords: () => void;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const single = view.value !== null;

  return (
    <Dialog open={open}>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        // 첫 버튼에 초점이 가면 열자마자 초점 링이 보인다.
        // 키보드 사용자는 모달 안에서 Tab으로 이어 간다.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        // 버튼만이 출구라 작은 화면과 큰 글자에서도 하단 버튼까지 스크롤로 닿게 한다.
        className="theme-soft-blue flex max-h-[calc(100dvh-24px)] w-[calc(100%-44px)] max-w-[358px] flex-col items-center gap-0 overflow-y-auto rounded-3xl border-0 bg-muted px-[22px] pt-7 pb-4 outline-none sm:rounded-3xl"
      >
        {/* 빛은 메달 수와 왕관 유무에 상관없이 모달 윗변에 붙어 있어 그림이 아닌 모달 기준으로 둔다. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-11 left-1/2 -z-10 size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--state-distract),transparent)] opacity-25"
        />
        <MedalArt stack={view.stack} crown={view.crown} single={single} />
        <DialogDescription className="mt-2.5 text-center text-[13px] leading-4 font-bold text-primary">
          {view.eyebrow}
        </DialogDescription>
        <DialogTitle className="mt-3 text-center break-keep text-[26px] leading-8 font-extrabold tracking-[-0.5px] text-foreground">
          {view.title}
        </DialogTitle>
        {view.value !== null && (
          <p className="mt-3 text-sm leading-[18px] text-muted-foreground">
            기록 <span className="font-bold text-foreground tabular-nums">{view.value}</span>
          </p>
        )}
        {view.counts !== null && (
          <ul className="mt-3.5 flex items-center gap-3">
            {view.counts.map(({ rank, count }) => (
              <li
                key={rank}
                aria-label={`${rank}위 ${count}개`}
                className="flex items-center gap-1.5 text-[13px] leading-4 font-bold text-foreground tabular-nums"
              >
                <IllustMedal rank={rank} size={16} />
                <span aria-hidden="true">{count}</span>
              </li>
            ))}
          </ul>
        )}
        {view.rows.length > 0 && (
          // 줄마다 판 이름과 기록 값을 나란히 담아 이름이 잘리지 않도록 버튼보다 모달 폭을 더 쓴다.
          <div className="-mx-3.5 mt-3.5 self-stretch rounded-lg bg-bg-layer-2">
            <ul>
              {view.rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3.5 px-3.5 py-2.5">
                  <IllustMedal rank={row.rank} size={24} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] leading-[18px] font-bold text-foreground">
                      {row.name}
                    </p>
                    <p className="mt-px text-[11px] leading-[14px] text-muted-foreground">
                      {row.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-[15px] leading-[18px] font-extrabold text-rank-value tabular-nums">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            {view.more > 0 && (
              <p className="pt-3 pb-3.5 text-center text-[13px] leading-4 text-muted-foreground">
                외 {view.more}개
              </p>
            )}
          </div>
        )}
        <p
          className={cn(
            "flex items-center gap-2 text-[13px] leading-4 break-keep text-muted-foreground",
            single && "mt-4 rounded-full bg-bg-layer-2 px-3.5 py-2.5",
            !single && "mt-3",
          )}
        >
          <span aria-hidden="true" className="flex">
            {([1, 2, 3] as const).map((rank, index) => (
              <IllustMedal
                key={rank}
                rank={rank}
                size={16}
                numbered={false}
                className={cn(index > 0 && "-ml-1.5")}
              />
            ))}
          </span>
          <span>
            현재까지 메달을{" "}
            <strong className="font-bold text-foreground tabular-nums">
              {formatRank(view.total)}번
            </strong>{" "}
            얻었어요
          </span>
        </p>
        <Button
          type="button"
          size="xl"
          onClick={onRecords}
          className="mt-4.5 h-[54px] w-full shrink-0 rounded-lg text-[17px] leading-[21px] font-bold"
        >
          랭킹 기록 보기
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="mt-2 h-11 w-full shrink-0 text-[15px] leading-[18px] font-bold text-muted-foreground hover:bg-bg-layer-2"
        >
          닫기
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 메달 그림
 *
 * 가운데 메달이 늘 화면 가운데에 오도록 양옆 칸을 같은 폭으로 둔다.
 * 양옆 메달은 가운데 메달 밑으로 살짝 들어가 겹치므로 가운데 칸을 위로 올린다.
 * 메달이 하나면 그림이 화면의 중심이라 메달과 왕관을 더 크게 그린다.
 */
function MedalArt({
  stack,
  crown,
  single,
}: {
  stack: MedalStack;
  crown: boolean;
  single: boolean;
}) {
  return (
    <div aria-hidden="true" className="grid w-full grid-cols-[1fr_auto_1fr] items-end">
      <div className="flex justify-end">
        {stack.left !== null && (
          <IllustMedal rank={stack.left} size={40} className="-mr-1 mb-0.5" />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center">
        {crown && (
          <IllustCrown
            width={single ? 31 : 27}
            height={single ? 21 : 18}
            className={cn(single && "mb-0.5")}
          />
        )}
        <IllustMedal rank={stack.center} size={single ? 76 : 60} />
      </div>
      <div className="flex justify-start">
        {stack.right !== null && (
          <IllustMedal rank={stack.right} size={40} className="-ml-1 mb-0.5" />
        )}
      </div>
    </div>
  );
}
