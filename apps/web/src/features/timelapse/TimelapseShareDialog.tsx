import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Ellipsis } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import instagramIcon from "@/assets/icons/brand-instagram.svg";
import kakaotalkIcon from "@/assets/icons/brand-kakaotalk.svg";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { COVERS_TAB_BAR_ATTR } from "@/lib/nativeModalOverlay";
import { showCtaToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

import type { TimelapseScene } from "./timelapseFrame";
import { TimelapsePlayer } from "./TimelapsePlayer";
import {
  timelapsePhotosQuery,
  timelapseVideoProgressQuery,
  timelapseVideoQuery,
} from "./timelapseQueries";
import {
  openTimelapseSettings,
  sendTimelapse,
  type ShareNotice,
  type ShareTapped,
  shareResultNotice,
  shareRoutes,
  shareVideoWidth,
} from "./timelapseShare";
import { getTimelapseStore, type TimelapseRecord, type TimelapseStore } from "./timelapseStore";
import { TimelapseVideoError } from "./timelapseVideo";

type TimelapseShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: TimelapseRecord;
  overlay: Pick<TimelapseScene, "info" | "text" | "flow">;
  entry: ShareTapped["entry"];
  store?: TimelapseStore;
};

/** 사진을 읽기 전에도 캔버스 고유 비율로 카드 높이를 잡아 두려고 빈 목록을 넘긴다. */
const NO_PHOTOS: readonly ArrayBuffer[] = [];

/**
 * 아직 측정하지 않은 자리
 *
 * 시안 폭으로 그린다.
 */
const UNMEASURED = { width: Infinity, height: Infinity };

/**
 * 카드 안에서 영상 말고 차지하는 길이
 *
 * 아래 카드의 패딩, 간격, 로고 줄 높이와 맞춘다.
 */
const CARD_CHROME = { x: 50, y: 85 };

/**
 * 타임랩스 공유 다이얼로그와 공유 시트
 *
 * 딤과 포커스 가두기를 하나로 두려고 카드와 시트를 Radix Dialog 하나에 함께 둔다.
 * 결과 화면은 뒤 카드에서 같은 영상이 이미 재생 중이라 카드 없이 시트만 연다.
 * Content가 화면 전체를 덮어 Radix의 바깥 누름 감지가 닿지 않으므로 빈 곳 누름을 직접 받는다.
 * 저장·공유 상태는 Content 안에 두어 닫으면 함께 버린다.
 */
export function TimelapseShareDialog({ open, onOpenChange, ...body }: TimelapseShareDialogProps) {
  const focusRestore = useDialogFocusRestore();
  const contentRef = useRef<HTMLDivElement>(null);
  // 닫힘 애니메이션 동안 딤이 토스트를 가리고 Radix가 토스트 영역을 aria-hidden으로 숨기므로 다 닫힌 뒤에 띄운다.
  const toastAfterClose = useRef<string | null>(null);
  // 저장 중에 먼저 닫았으면 저장 결과가 닫힘 뒤에 와서 바로 띄워야 한다.
  const closeFinished = useRef(false);
  // 열 때마다, 그리고 레코드가 바뀔 때마다 번호를 올려 본문을 새로 만든다.
  // 닫히는 도중 다시 열면 본문이 남아 앞 열림에서 보낸 저장·공유의 결과가 새 창의 잠금과 안내를 바꾸기 때문이다.
  const startedAtMs = body.record.startedAtMs;
  const [session, setSession] = useState({ open, startedAtMs, id: 0 });
  if (open !== session.open || startedAtMs !== session.startedAtMs) {
    setSession({ open, startedAtMs, id: open ? session.id + 1 : session.id });
  }
  const currentSession = useRef(session.id);
  useEffect(() => {
    currentSession.current = session.id;
  }, [session.id]);
  // 닫히는 도중 다시 열면 언마운트가 일어나지 않으므로 앞 저장의 문구를 여기서 버린다.
  // 다시 열린 창은 아직 닫히지 않았으므로 닫힘 끝남 표시도 끈다.
  useEffect(() => {
    if (!open) return;
    toastAfterClose.current = null;
    closeFinished.current = false;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          // 공용 DialogContent와 같은 이유로 직접 단다.
          // 네이티브 탭 바 차단 감지가 이 속성만 본다.
          aria-modal="true"
          // 시트가 화면 바닥의 떠 있는 네이티브 탭 바 자리를 덮으므로 탭 바를 숨기게 한다.
          {...{ [COVERS_TAB_BAR_ATTR]: "" }}
          // 터치로 연 창의 첫 버튼에 포커스 링이 남지 않게 창 자체에 포커스를 둔다.
          onOpenAutoFocus={(event) => {
            focusRestore.onOpenAutoFocus();
            event.preventDefault();
            contentRef.current?.focus();
          }}
          // Content가 언마운트된 뒤에 불린다.
          onCloseAutoFocus={(event) => {
            focusRestore.onCloseAutoFocus(event);
            closeFinished.current = true;
            const toast = toastAfterClose.current;
            toastAfterClose.current = null;
            if (toast !== null) showCtaToast(toast);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
          // Radix 스크롤 잠금은 스크롤할 곳이 없는 자리의 touchmove를 막고, iOS는 막힌 터치를 클릭으로 만들지 않는다.
          // 그래서 잠금까지 올려 보내지 않고, 대신 이 창에서는 끌어도 아무것도 밀리지 않게 터치 팬을 끈다.
          onTouchMove={(event) => event.stopPropagation()}
          className="theme-soft-blue group text-foreground fixed inset-0 z-50 flex touch-none flex-col outline-none duration-300 ease-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        >
          <ShareDialogBody
            key={session.id}
            {...body}
            onSaved={(toast) => {
              if (closeFinished.current) {
                if (toast !== null) showCtaToast(toast);
                return;
              }
              // 앞 열림의 저장도 실제로 됐으므로 알리되, 새로 연 창은 닫지 않고 그 창이 닫힌 뒤에 띄운다.
              if (session.id !== currentSession.current) {
                if (toast !== null) toastAfterClose.current = toast;
                return;
              }
              toastAfterClose.current = toast;
              onOpenChange(false);
            }}
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function ShareDialogBody({
  record,
  overlay,
  entry,
  store = getTimelapseStore(),
  onSaved,
}: Omit<TimelapseShareDialogProps, "open" | "onOpenChange"> & {
  /**
   * 결과 화면 저장 성공
   *
   * 띄울 토스트 문구를 넘긴다.
   */
  onSaved: (toast: string | null) => void;
}) {
  const sheetOnly = entry === "result";
  const startedAtMs = record.startedAtMs;
  const aspect = record.settings.aspect;
  // 앱과 브라우저 기능은 창이 열려 있는 동안 바뀌지 않는다.
  const [routes] = useState(shareRoutes);
  const available = routes.save !== null || routes.share !== null;
  const photos = useQuery({ ...timelapsePhotosQuery(startedAtMs, store), enabled: !sheetOnly });
  // 저장도 공유도 할 수 없는 환경이면 쓸 곳이 없어 만들지 않는다.
  const video = useQuery({ ...timelapseVideoQuery(startedAtMs, store), enabled: available });
  const progress = useQuery(timelapseVideoProgressQuery(startedAtMs));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ShareNotice | null>(null);

  const spaceRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = spaceRef.current;
    // 결과 화면은 카드를 그리지 않아 측정할 것이 없다.
    if (sheetOnly || element === null) return;
    const observer = new ResizeObserver(([rect]) => {
      if (rect !== undefined) {
        setSpace({ width: rect.contentRect.width, height: rect.contentRect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [sheetOnly]);

  const preparing = available && (video.isPending || video.isFetching);
  const failed = video.isError && !video.isFetching;
  const unsupported =
    failed && video.error instanceof TimelapseVideoError && video.error.stage === "unsupported";
  const locked = !video.isSuccess || busy;

  const run = async (button: ShareTapped["button"]) => {
    const action = button === "save" ? "save" : "share";
    const route = action === "save" ? routes.save : routes.share;
    if (!video.isSuccess || busy || route === null) return;
    setBusy(true);
    setNotice(null);
    const result = await sendTimelapse({ button, route, video: video.data, startedAtMs, entry });
    // 보내기는 오류도 결과로 돌려주므로 여기서 잠금을 풀면 성공과 실패 모두 풀린다.
    setBusy(false);
    const resultNotice = shareResultNotice(action, route, result);
    // 결과 화면은 저장되면 시트를 닫고, 앱 저장이면 닫힌 뒤에도 보이도록 토스트로 알린다.
    if (sheetOnly && action === "save" && result === "saved") {
      onSaved(resultNotice?.text ?? null);
      return;
    }
    setNotice(resultNotice);
  };

  const retry = () => void video.refetch();

  const message: ReactNode = !available ? (
    <StatusText>앱을 업데이트하면 저장하고 공유할 수 있어요</StatusText>
  ) : sheetOnly && preparing ? (
    // 문구와 막대를 합쳐도 안내 줄 자리 높이를 넘지 않아 시트 높이가 바뀌지 않는다.
    <div className="flex w-full flex-col items-center gap-2">
      <StatusText>공유할 영상을 생성하고 있어요</StatusText>
      <ProgressBar progress={progress.data ?? 0} className="bg-border" />
    </div>
  ) : unsupported ? (
    <StatusText>이 기기에서는 영상을 만들 수 없어요</StatusText>
  ) : failed ? (
    <>
      <StatusText>영상을 만들지 못했어요</StatusText>
      <TextButton onClick={retry}>다시 시도</TextButton>
    </>
  ) : notice !== null ? (
    <>
      <StatusText>{notice.text}</StatusText>
      {notice.openSettings === true && (
        <TextButton onClick={openTimelapseSettings}>설정 열기</TextButton>
      )}
    </>
  ) : null;

  return (
    <>
      {/* 빈 곳 누름이 Content까지 가도록 이 칸은 누름을 받지 않고 카드만 받는다. */}
      <div
        ref={spaceRef}
        className="pointer-events-none flex min-h-0 flex-1 items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-4"
      >
        {!sheetOnly && (
          <div className="bg-muted border-border pointer-events-auto flex flex-col items-center gap-4 rounded-lg border p-6 shadow-lg duration-300 ease-overlay motion-safe:group-data-[state=open]:animate-in motion-safe:group-data-[state=open]:zoom-in-95">
            <div style={{ width: shareVideoWidth(aspect, space ?? UNMEASURED, CARD_CHROME) }}>
              <TimelapsePlayer
                aspect={aspect}
                photos={photos.data ?? NO_PHOTOS}
                overlay={overlay}
                className="w-full rounded-sm"
              >
                {preparing && <PreparingCover progress={progress.data ?? 0} />}
              </TimelapsePlayer>
            </div>
            <p className="text-primary text-base leading-[19px] font-extrabold">포커스 메이커스</p>
          </div>
        )}
      </div>

      <section className="bg-muted rounded-t-[24px] px-5 pt-7 pb-[max(34px,calc(env(safe-area-inset-bottom)+8px))] duration-300 ease-overlay motion-safe:group-data-[state=open]:animate-in motion-safe:group-data-[state=open]:slide-in-from-bottom motion-safe:group-data-[state=closed]:animate-out motion-safe:group-data-[state=closed]:slide-out-to-bottom shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
        <DialogTitle className="text-foreground text-center text-[17px] leading-5 font-bold tracking-normal">
          공유하기
        </DialogTitle>
        {available && (
          <ul className="mt-4 flex justify-around">
            {routes.save !== null && (
              <ShareButton
                label="저장하기"
                icon={
                  <GlyphCircle>
                    <ArrowDownToLine size={24} aria-hidden="true" />
                  </GlyphCircle>
                }
                disabled={locked}
                onClick={() => void run("save")}
              />
            )}
            {routes.share !== null && (
              <>
                <ShareButton
                  label="인스타그램"
                  icon={<img src={instagramIcon} alt="" className="size-14" />}
                  disabled={locked}
                  onClick={() => void run("instagram")}
                />
                <ShareButton
                  label="카카오톡"
                  icon={<img src={kakaotalkIcon} alt="" className="size-14" />}
                  disabled={locked}
                  onClick={() => void run("kakao")}
                />
                <ShareButton
                  label="더 보기"
                  icon={
                    <GlyphCircle>
                      <Ellipsis size={24} aria-hidden="true" />
                    </GlyphCircle>
                  }
                  disabled={locked}
                  onClick={() => void run("more")}
                />
              </>
            )}
          </ul>
        )}
        {/* 안내가 나타나도 시트 높이가 바뀌지 않도록 한 줄 자리를 늘 둔다. */}
        <div role="status" className="mt-2 flex min-h-11 items-center justify-center gap-1 px-1">
          {message}
        </div>
      </section>
    </>
  );
}

function PreparingCover({ progress }: { progress: number }) {
  return (
    // z-index를 주지 않아 뒤에 그리는 일시정지 버튼이 이 덮개 위층에 남는다.
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-6 text-white">
      <p className="text-center text-sm leading-[17px] font-semibold break-keep">
        공유할 영상을 생성하고 있어요
      </p>
      <ProgressBar progress={progress} className="bg-white/30" />
    </div>
  );
}

function ProgressBar({ progress, className }: { progress: number; className: string }) {
  return (
    <div
      role="progressbar"
      aria-label="영상 생성 진행률"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className={cn("h-1 w-full max-w-40 overflow-hidden rounded-full", className)}
    >
      <div
        className="bg-primary h-full origin-left transition-transform duration-200 ease-linear motion-reduce:transition-none"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

function ShareButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        // disabled 속성을 쓰면 누른 버튼이 잠기는 순간 포커스가 문서 밖으로 빠진다.
        aria-disabled={disabled}
        onClick={disabled ? undefined : onClick}
        className="flex h-20 w-[72px] flex-col items-center gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none aria-disabled:opacity-40"
      >
        {icon}
        <span className="text-muted-foreground text-[13px] leading-4">{label}</span>
      </button>
    </li>
  );
}

function GlyphCircle({ children }: { children: ReactNode }) {
  return (
    <span className="bg-bg-layer-2 text-foreground flex size-14 items-center justify-center rounded-full">
      {children}
    </span>
  );
}

export function StatusText({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-center text-[13px] leading-5 break-keep">{children}</p>
  );
}

export function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-primary flex min-h-11 items-center px-2 text-[13px] leading-5 font-semibold focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
