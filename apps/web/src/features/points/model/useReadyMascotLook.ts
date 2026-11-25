import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { MascotLook } from "@/components/mascot/types";
import { isPointsEnabled } from "@/lib/pointsCapability";
import { lookQuery } from "@/lib/pointsQueries";

import { appPointsGateway } from "../gateway/appPointsGateway";
import { mascotLookImageUrls, preloadImages, useImagesPreloaded } from "./mascotLookImages";

/**
 * 결과 화면이 내 모습과 그 그림을 기다리는 최대 시간
 *
 * 세션 중에 미리 받았거나 기기에 남긴 모습이 있으면 기다리지 않는다.
 * 둘 다 없는 첫 결과 화면에서만 기다리고, 이 시간이 지나면 그때 가진 것으로 연출을 시작한다.
 */
export const MASCOT_LOOK_WAIT_MS = 800;

/**
 * 결과 화면이 그릴 내 마스코트 모습과 그려도 되는지
 *
 * 모습을 아직 모르는 채 기본 마스코트로 뛰었다가 고른 마스코트로 바뀌지 않게, 모습과 그 그림이 준비된 뒤에 ready가 된다.
 * 서버가 고른 마스코트가 없다고 답했거나 받지 못했으면 그 답을 받은 때 기본 마스코트로 준비된다.
 * 기다림이 MASCOT_LOOK_WAIT_MS를 넘으면 그때 가진 모습으로 준비된다.
 * 한 번 준비되면 뒤에 모습이 바뀌어도 다시 기다리지 않는다.
 * 포인트가 꺼져 있거나 사용자가 없으면 받지 않고 처음부터 기본 마스코트로 준비되어 예전 화면과 같다.
 */
export function useReadyMascotLook(userId: number | null): {
  look: MascotLook | null;
  ready: boolean;
} {
  const enabled = isPointsEnabled() && userId !== null;
  const query = useQuery({ ...lookQuery(appPointsGateway(), userId ?? 0), enabled });
  const look = enabled ? (query.data ?? null) : null;
  const answered = !enabled || query.data !== undefined || query.isError;
  const urls = useMemo(() => (look === null ? [] : mascotLookImageUrls(look)), [look]);
  const loaded = useImagesPreloaded(urls);
  const [waitedOut, setWaitedOut] = useState(false);
  const readyNow = waitedOut || (answered && loaded);
  const [started, setStarted] = useState(readyNow);
  if (readyNow && !started) {
    setStarted(true);
  }

  useEffect(() => {
    if (started) {
      return;
    }
    const timer = window.setTimeout(() => setWaitedOut(true), MASCOT_LOOK_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [started]);

  useEffect(() => {
    if (!loaded) {
      void preloadImages(urls);
    }
  }, [urls, loaded]);

  return { look, ready: started || readyNow };
}
