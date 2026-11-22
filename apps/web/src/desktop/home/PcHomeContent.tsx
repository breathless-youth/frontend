import { lazy, Suspense, useState, type ReactNode } from "react";

import { HomeStudyBlocks } from "@/features/home-v3/HomeV3Content";
import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";
import { useTimerBackground } from "@/features/timer-background/timerBackground";
import { useWatcher } from "@/features/timer-background/watcher/useWatcher";
import { reloadOnChunkError } from "@/lib/chunkReload";

import { loadPcStudySession } from "../session/loadPcStudySession";
import type { PcWatchState } from "../session/PcStudySession";
import type { PcSessionRequest } from "../session/usePcSession";
import { PcContactButton } from "./PcContactButton";
import { PcHomeRail } from "./PcHomeRail";
import { PcSpaceFlyout } from "./PcSpaceFlyout";
import { PcStudyPanel } from "./PcStudyPanel";
import { PcWallpaper } from "./PcWallpaper";

// 공부를 시작한 사람만 세션 엔진과 비전 코드를 받는다.
const LazyPcStudySession = lazy(
  reloadOnChunkError(() =>
    loadPcStudySession().then((module) => ({ default: module.PcStudySession })),
  ),
);

export interface PcHomeContentProps extends HomeV3ContentProps {
  /** 레일 맨 위 D-Day 버튼. 토큰 출처가 없는 문서는 비운다. */
  dday: ReactNode;
  /** 문의 버튼이 작은 창으로 열 상담 화면 주소 */
  contactHref: string;
  /** 홈 위에 연 공부 세션. 없으면 홈이다. */
  session: PcSessionRequest | null;
  onSessionEnd: () => void;
}

/**
 * PC 홈 본문
 *
 * 폰 새 홈과 같은 값과 동작을 받아 월페이퍼 위에 레일·공부시간 패널·문의 버튼을 띄운다.
 * 이 상자를 플라이아웃의 포털 자리로 넘겨 플라이아웃이 상자 기준으로 놓이고 홈 테마를 물려받는다.
 * 키보드가 레일 → 패널 → 문의 순서로 가도록 문서 순서를 두고, 겹침은 층 값으로 정한다.
 * 전체 선택이나 끌어 선택이 월페이퍼 사진까지 파랗게 칠하지 않게 홈 전체를 글자 선택과 그림 끌기에서 뺀다.
 * D-Day·목표 가운데 창은 body로 나가 이 범위 밖이라 입력은 그대로 된다.
 * 공부 세션을 열면 같은 자리에 세션 패널을 그리고, 세션을 만들기 전까지는 홈 패널을 시작 중 모양으로 남긴다.
 */
export function PcHomeContent({
  dday,
  contactHref,
  session,
  onSessionEnd,
  ...content
}: PcHomeContentProps) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const space = useTimerBackground();
  const [watchState, setWatchState] = useState<PcWatchState | null>(null);
  // 월페이퍼의 감독관과 소리, 공간 창의 음량 줄이 같은 상태를 쓰도록 홈에서 한 번만 만든다.
  const watcher = useWatcher(
    space.kind === "space" && space.videoMode === "WATCH" ? space.assetKey : null,
    watchState?.trigger ?? null,
    watchState?.studying ?? false,
  );
  const homePanel = (
    <PcStudyPanel stats={content.stats}>
      <HomeStudyBlocks
        {...content}
        startingStudy={content.startingStudy === true || session !== null}
      />
    </PcStudyPanel>
  );
  return (
    <div ref={setBox} className="session-no-drag absolute inset-0 overflow-hidden">
      <PcWallpaper watcher={watcher} />
      <PcHomeRail>
        {dday}
        <PcSpaceFlyout container={box} watcher={watcher} />
      </PcHomeRail>
      {session === null ? (
        homePanel
      ) : (
        <Suspense fallback={homePanel}>
          <LazyPcStudySession
            key={session.key}
            request={session}
            content={content}
            box={box}
            pending={homePanel}
            onEnd={onSessionEnd}
            onWatchChange={setWatchState}
          />
        </Suspense>
      )}
      {/* 공부 중에 상담 창을 열면 공부와 겹쳐 공부하는 동안은 숨긴다. */}
      {session === null && <PcContactButton href={contactHref} />}
    </div>
  );
}
