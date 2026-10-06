import type { NoticeResponse } from "@focusmakers/types";
import { useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * 홈 공지 모달
 *
 * 일반 공지와 인터뷰 공지가 같은 틀을 쓰고, 서버가 준 항목만 그린다.
 * 버튼으로만 닫히는 안내라 Esc·바깥 탭을 막는다.
 * 하단 탭바는 aria-modal을 감지한 쪽이 딤으로 덮는다.
 */
export function NoticeModal({
  notice,
  onPrimary,
  onNeverAgain,
  onClose,
}: {
  notice: NoticeResponse;
  /** 없으면 본 버튼을 그리지 않는다. 열 수 없는 링크를 버튼으로 보이지 않게 호스트가 정한다 */
  onPrimary?: () => void;
  onNeverAgain: () => void;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog open>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        // 첫 버튼에 초점이 가면 열자마자 초점 링이 보인다. 키보드 사용자는 모달 안에서 Tab으로 이어 간다.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        // 버튼만이 출구라 작은 화면·큰 글자에서도 하단 버튼까지 스크롤로 닿게 한다.
        // body로 포털돼 홈의 테마 범위를 벗어나므로 같은 토큰을 직접 건다.
        className="theme-soft-blue flex max-h-[calc(100dvh-24px)] w-[calc(100%-3rem)] max-w-[354px] flex-col items-center gap-0 overflow-y-auto rounded-3xl border-0 bg-muted px-[22px] pt-[22px] pb-3 outline-none sm:rounded-3xl"
      >
        {notice.imageUrl !== null && (
          <img
            src={notice.imageUrl}
            alt=""
            className="aspect-[310/174] w-full shrink-0 rounded-lg bg-brand-subtle object-cover"
          />
        )}
        {notice.badgeText !== null && (
          <Badge variant="elevated" className="mt-4">
            {notice.badgeText}
          </Badge>
        )}
        <DialogTitle className="mt-3 text-center break-keep text-[19px] leading-[23px] font-black tracking-[-0.38px] text-foreground">
          {notice.title}
        </DialogTitle>
        <DialogDescription className="mt-2 text-center break-keep text-[14px] leading-[21px] whitespace-pre-line text-muted-foreground">
          {notice.content}
        </DialogDescription>
        {onPrimary !== undefined && notice.buttonText !== null && (
          <Button
            type="button"
            size="xl"
            onClick={onPrimary}
            className="mt-5 w-full shrink-0 rounded-xl text-[17px] leading-[21px] font-bold"
          >
            {notice.buttonText}
          </Button>
        )}
        <div className="mt-1.5 flex w-full items-center">
          <Button
            type="button"
            variant="ghost"
            onClick={onNeverAgain}
            className="h-11 flex-1 text-[15px] hover:bg-bg-layer-2 leading-[18px] font-bold text-muted-foreground"
          >
            다시 보지 않기
          </Button>
          <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-border" />
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-11 flex-1 text-[15px] hover:bg-bg-layer-2 leading-[18px] font-bold text-foreground"
          >
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
