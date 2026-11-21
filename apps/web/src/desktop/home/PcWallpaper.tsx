import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PC_WATCH_VIEWPORT } from "@/features/timer-background/spaceFiles";
import { ImageSpace, LoopVideoSpace } from "@/features/timer-background/SpaceLayers";
import { TimerBackgroundLayer } from "@/features/timer-background/TimerBackgroundLayer";
import {
  SIMPLE_BACKGROUND_COLOR,
  type TimerBackgroundSelection,
  useTimerBackground,
} from "@/features/timer-background/timerBackground";
import { timerBackgroundPhotoQuery } from "@/features/timer-background/timerBackgroundQueries";
import { WatcherBackground } from "@/features/timer-background/watcher/WatcherBackground";

/**
 * PC 홈 상자 전체에 까는 월페이퍼
 *
 * 공간을 고르면 같은 탭과 다른 탭 모두에서 바로 바뀐다.
 * 심플 단색을 늘 깔고 사진은 읽힌 뒤에만 덮어서, 지웠거나 읽지 못한 사진은 심플로 보인다.
 * 서버 공간은 세션 화면과 같은 부품으로 그리고, 받지 못한 반복 영상과 그림은 선택 값을 유지한 채 심플로 보인다.
 * 감시 공간은 PC 파일이 없어 창 크기와 상관없이 태블릿 가로 파일로 빈 방을 보인다.
 * 위의 레일·패널·문의가 모두 불투명해 어두운 막을 두지 않는다.
 */
export function PcWallpaper() {
  const selection = useTimerBackground();
  const photo = useQuery(
    timerBackgroundPhotoQuery(selection.kind === "photo" ? selection.photoId : null),
  );
  // 받지 못한 선택 값이다.
  // 구독 값은 바뀔 때만 새 객체라, 다른 공간을 거쳐 다시 고르면 다른 객체가 되어 다시 그린다.
  const [failed, setFailed] = useState<TimerBackgroundSelection | null>(null);
  const space = selection.kind === "space" && selection !== failed ? selection : null;
  const fail = () => setFailed(selection);
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{ backgroundColor: SIMPLE_BACKGROUND_COLOR }}
    >
      {photo.data && <TimerBackgroundLayer src={photo.data.src} fit={photo.data.fit} />}
      {space?.assetType === "IMAGE" && (
        <ImageSpace key={space.assetKey} assetKey={space.assetKey} onUnavailable={fail} />
      )}
      {space?.videoMode === "LOOP" && (
        <LoopVideoSpace key={space.assetKey} assetKey={space.assetKey} onUnavailable={fail} />
      )}
      {space?.videoMode === "WATCH" && (
        // ponytail: PC 세션의 비집중을 이 층에 넘기지 않아 감독관은 들어오지 않고 빈 방만 보인다.
        // PC 세션에서 감시를 쓰려면 세션 상태와 감시 소리를 여기로 넘긴다.
        <WatcherBackground
          key={space.assetKey}
          assetKey={space.assetKey}
          fixedViewport={PC_WATCH_VIEWPORT}
          present={false}
        />
      )}
    </div>
  );
}
