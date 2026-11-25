import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { MascotLook } from "@/components/mascot/types";
import { isPointsEnabled } from "@/lib/pointsCapability";
import { lookQuery } from "@/lib/pointsQueries";
import { profileQuery } from "@/lib/profileQueries";
import { whenIdle } from "@/lib/whenIdle";

import { appPointsGateway } from "../gateway/appPointsGateway";
import { isMemberProfile } from "../usePointsAccess";
import { mascotLookImageUrls, preloadImages, warmImageCache } from "./mascotLookImages";

/**
 * 그림을 어디까지 준비할지
 *
 * - `warm`: 파일만 HTTP 캐시에 받는다. 카메라와 감지 모델이 도는 세션 중에 디코드한 비트맵으로 메모리를 늘리지 않는다.
 * - `decode`: 받아서 디코드까지 한다. 종료 버튼을 누른 뒤에는 카메라를 끄고 결과 화면으로 넘어가서 이때 한다.
 */
export type MascotImagePrep = "warm" | "decode";

/**
 * 결과 화면이 그릴 내 마스코트 모습을 세션 중에 미리 받기
 *
 * 세션 화면은 결과 화면으로 웹 라우터 이동만 하므로 둘은 같은 문서이고 같은 조회 캐시를 쓴다.
 * 결과 화면이 뜨기 전에 모습과 그 그림을 받아 두어, 처음 그림부터 고른 마스코트가 소품을 낀 채 뛰게 한다.
 * 포인트가 꺼져 있거나, 사용자가 없거나, 회원으로 확인되지 않으면 아무것도 받지 않는다.
 * 회원 여부는 프로필로 보고, 결과 화면의 포인트 카드도 같은 프로필을 쓰므로 이 조회는 캐시를 앞당길 뿐이다.
 * 세션 동안 이 조회를 보는 화면이 없어도 결과 화면까지 남도록 캐시에서 치우지 않는다.
 * 미리 받기는 최적화라 실패해도 삼키고, 결과 화면이 다시 받는다.
 */
export async function prefetchMyMascotLook(
  queryClient: QueryClient,
  userId: number | null,
  images: MascotImagePrep,
): Promise<void> {
  if (!isPointsEnabled() || userId === null) {
    return;
  }
  const member = await queryClient.ensureQueryData(profileQuery(userId)).then(
    (profile) => isMemberProfile(profile),
    () => false,
  );
  if (!member) {
    return;
  }
  const prepare = (look: MascotLook | null | undefined) => {
    if (!look) {
      return Promise.resolve();
    }
    const urls = mascotLookImageUrls(look);
    return images === "decode" ? preloadImages(urls) : warmImageCache(urls);
  };
  const options = lookQuery(appPointsGateway(), userId);
  // 조회를 먼저 걸어야 캐시가 비었을 때 기기에 남긴 모습으로 조회가 만들어진다.
  const fetched = queryClient.prefetchQuery({ ...options, gcTime: Infinity });
  // 이미 아는 모습(앞서 받았거나 기기에 남긴 값)의 그림은 서버 답을 기다리지 않고 바로 준비한다.
  const known = queryClient.getQueryData(options.queryKey);
  const preparedKnown = prepare(known);
  await fetched;
  const latest = queryClient.getQueryData(options.queryKey);
  await Promise.all([preparedKnown, latest === known ? undefined : prepare(latest)]);
}

/**
 * 세션 화면의 내 마스코트 모습 미리 받기
 *
 * 화면이 열리면 카메라와 감지 모델을 먼저 받도록 한가할 때 모습을 받고 그림은 HTTP 캐시만 데운다.
 * 종료 버튼을 누르면 돌려준 함수로 모습을 한 번 더 받고 그림을 디코드한다.
 * 세션이 길면 그 사이 다른 기기에서 바꾼 모습도 종료 직전에 맞춘다.
 * 세션 화면은 조회 캐시를 직접 들고 있는 곳도 있어서 캐시를 받아 쓴다.
 */
export function useMascotLookPrefetch(queryClient: QueryClient, userId: number | null): () => void {
  useEffect(() => {
    whenIdle(() => void prefetchMyMascotLook(queryClient, userId, "warm"));
  }, [queryClient, userId]);
  return () => void prefetchMyMascotLook(queryClient, userId, "decode");
}
