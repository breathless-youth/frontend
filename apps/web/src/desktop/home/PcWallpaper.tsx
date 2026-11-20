import { useQuery } from "@tanstack/react-query";

import { TimerBackgroundLayer } from "@/features/timer-background/TimerBackgroundLayer";
import {
  SIMPLE_BACKGROUND_COLOR,
  useTimerBackground,
} from "@/features/timer-background/timerBackground";
import { timerBackgroundPhotoQuery } from "@/features/timer-background/timerBackgroundQueries";

/**
 * PC 홈 상자 전체에 까는 월페이퍼
 *
 * 공간을 고르면 같은 탭과 다른 탭 모두에서 바로 바뀐다.
 * 심플 단색을 늘 깔고 사진은 읽힌 뒤에만 덮어서, 지웠거나 읽지 못한 사진은 심플로 보인다.
 * 위의 레일·패널·문의가 모두 불투명해 어두운 막을 두지 않는다.
 */
export function PcWallpaper() {
  const selection = useTimerBackground();
  const photo = useQuery(
    timerBackgroundPhotoQuery(selection.kind === "photo" ? selection.photoId : null),
  );
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{ backgroundColor: SIMPLE_BACKGROUND_COLOR }}
    >
      {photo.data && <TimerBackgroundLayer src={photo.data.src} fit={photo.data.fit} />}
    </div>
  );
}
