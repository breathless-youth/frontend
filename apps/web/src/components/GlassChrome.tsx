import type { GlassChromeTop } from "@focusmakers/types";
import { NATIVE_CONTROL_LABEL_MAX_LENGTH } from "@focusmakers/types";
import { ChevronLeft, X } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useId } from "react";

import { postToNative } from "@/lib/bridge";
import { glassChromeVersion, registerPressHandler } from "@/lib/glassChrome";
import { useModalOverlayOpen } from "@/lib/nativeModalOverlay";

/**
 * 위쪽 뒤로 가기 줄
 *
 * 제목과 라벨은 40자를 넘으면 앱으로 보낼 때 자른다.
 * 넘긴 채 보내면 앱이 메시지 전체를 버린다.
 */
export type GlassChromeTopProps = {
  leading: "back" | "close";
  /** 기본값은 `뒤로 가기`, `닫기`다. */
  leadingLabel?: string;
  onLeading: () => void;
  title?: string;
  /**
   * 제목 대신 가운데에 두는 웹 요소
   *
   * 앱 모드에서도 앱은 뒤로 버튼만 그리고 이 요소는 웹이 같은 자리에 그린다.
   * 제목 역할이면 요소 안에 `h1`을 직접 둔다.
   */
  center?: ReactNode;
};

const LEADING_LABELS = { back: "뒤로 가기", close: "닫기" } as const;

function clip(text: string): string {
  return text.slice(0, NATIVE_CONTROL_LABEL_MAX_LENGTH);
}

function toChromeTop(top: GlassChromeTopProps): GlassChromeTop {
  return {
    leading: top.leading,
    leadingLabel: clip(top.leadingLabel || LEADING_LABELS[top.leading]),
    // 앱은 빈 글자도 버리므로 제목이 비면 없는 것으로 보낸다.
    // 가운데 요소가 있으면 CSS 대체처럼 그 요소가 제목 자리를 차지한다.
    title: top.title && top.center === undefined ? clip(top.title) : null,
  };
}

/*
 * 화면에 놓인 GlassChrome들이 선언한 위쪽 줄
 *
 * 화면 전환 중에는 새 화면이 먼저 선언하고 이전 화면이 나중에 해제할 수 있어서 요소마다 따로 두고 남은 선언을 보낸다.
 */
const chromeTops = new Map<string, GlassChromeTop>();
let chromeObscured = false;

function postChrome(): void {
  postToNative({
    type: "set-glass-chrome",
    top: [...chromeTops.values()].at(-1) ?? null,
    obscured: chromeTops.size > 0 && chromeObscured,
    atMs: Date.now(),
  });
}

// 문서 단위로 이동했다 돌아오면 bfcache에서 되살아나는데, 그 사이 앱은 glass 층을 비웠고 effect는 다시 돌지 않는다.
window.addEventListener("pageshow", (event) => {
  if (event.persisted && chromeTops.size > 0) {
    postChrome();
  }
});

/**
 * 화면 위에 떠 있는 뒤로 가기 줄
 *
 * 앱이 `glassChrome=1`을 붙였으면 `set-glass-chrome`을 보내 네이티브 glass로 그리게 하고 웹은 자리만 비운다.
 * 그 밖의 환경에서는 같은 자리에 CSS glass로 그려 두 모드의 배치가 같다.
 * 비우는 자리는 이 요소가 놓인 곳에 생기므로 페이지 맨 앞에 둔다.
 * 가장자리 흐림은 두 모드 모두 웹이 그리고 `--glass-fade-top`이 없으면 페이지 바탕색을 쓴다.
 */
export function GlassChrome({ top }: { top: GlassChromeTopProps }) {
  const instanceId = useId();
  // 지금 모양은 버전 1부터 그린다.
  // 새 모양을 더하면 그 모양을 그리는 앱 버전을 따로 확인하고 그보다 낮으면 CSS로 그린다.
  const native = glassChromeVersion() >= 1;
  const modalOpen = useModalOverlayOpen();

  // 콜백은 렌더마다 새로 만들어지므로 보낼 값만 문자열로 비교해 바뀔 때만 보낸다.
  const part = native ? JSON.stringify(toChromeTop(top)) : null;

  useEffect(() => {
    if (part === null) {
      return;
    }
    chromeTops.set(instanceId, JSON.parse(part) as GlassChromeTop);
    chromeObscured = modalOpen;
    postChrome();
  }, [instanceId, part, modalOpen]);

  // 값이 바뀔 때마다 비웠다 다시 보내면 네이티브 층이 깜빡이므로 비우는 것은 언마운트 때만 한다.
  useEffect(() => {
    if (!native) {
      return;
    }
    return () => {
      chromeTops.delete(instanceId);
      postChrome();
    };
  }, [instanceId, native]);

  const onLeading = useEffectEvent(() => {
    top.onLeading();
  });

  useEffect(() => {
    if (!native) {
      return;
    }
    return registerPressHandler("chrome:leading", () => {
      onLeading();
    });
  }, [native]);

  return (
    <>
      {/* 앱이 본문 부품을 자르는 선(GLASS_TOP_ROW_CLIP)과 같은 높이라 한쪽만 바꾸지 않는다. */}
      <div aria-hidden className="h-[calc(env(safe-area-inset-top)+52px)] shrink-0" />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 glass-fade-top" />
      {(!native || top.center !== undefined) && <GlassTopBar top={top} withLeading={!native} />}
    </>
  );
}

function GlassTopBar({ top, withLeading }: { top: GlassChromeTopProps; withLeading: boolean }) {
  const LeadingIcon = top.leading === "back" ? ChevronLeft : X;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 px-5 pt-[calc(env(safe-area-inset-top)+4px)]">
      <div className="relative flex h-11 items-center">
        {withLeading && (
          <button
            type="button"
            aria-label={top.leadingLabel || LEADING_LABELS[top.leading]}
            onClick={top.onLeading}
            className="pointer-events-auto flex size-11 items-center justify-center rounded-full glass-surface"
          >
            <LeadingIcon size={20} aria-hidden />
          </button>
        )}
        {/* 양쪽에 버튼 폭과 간격만큼 비워 제목이 화면 가운데에 온다. */}
        {top.center !== undefined ? (
          // 줄의 빈 곳은 아래 본문으로 누름을 넘기고 가운데 요소만 누름을 받는다.
          <div className="absolute inset-x-14 top-0 flex h-11 items-center justify-center *:pointer-events-auto">
            {top.center}
          </div>
        ) : (
          top.title && (
            <h1 className="absolute inset-x-14 top-0 truncate text-center text-[17px] leading-11 font-semibold">
              {top.title}
            </h1>
          )
        )}
      </div>
    </div>
  );
}
