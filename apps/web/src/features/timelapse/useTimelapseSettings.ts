import { useEffect, useState } from "react";

import {
  loadTimelapseSettings,
  saveTimelapseSettings,
  type TimelapseSettings,
} from "./timelapseSettings";

/**
 * 설정 화면의 타임랩스 설정 상태
 *
 * 읽기 전에는 null을 돌려 화면이 기본값을 먼저 그렸다가 바꾸지 않게 한다.
 * 값을 쓰는 곳이 이 화면뿐이라 다른 문서의 변경은 구독하지 않는다.
 */
export function useTimelapseSettings() {
  const [settings, setSettings] = useState<TimelapseSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTimelapseSettings().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (next: TimelapseSettings) => {
    setSettings(next);
    void saveTimelapseSettings(next);
  };

  return [settings, update] as const;
}
