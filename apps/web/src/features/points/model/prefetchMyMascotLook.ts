import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { isPointsEnabled } from "@/lib/pointsCapability";
import { lookQuery } from "@/lib/pointsQueries";
import { profileQuery } from "@/lib/profileQueries";
import { whenIdle } from "@/lib/whenIdle";

import { appPointsGateway } from "../gateway/appPointsGateway";
import { isMemberProfile } from "../usePointsAccess";
import { mascotLookImageUrls, preloadImages } from "./mascotLookImages";

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
  const options = lookQuery(appPointsGateway(), userId);
  await queryClient.prefetchQuery({ ...options, gcTime: Infinity });
  // 서버에서 받지 못해도 기기에 남긴 모습이 있으면 그 그림을 받아 둔다.
  const look = queryClient.getQueryData(options.queryKey);
  if (look) {
    await preloadImages(mascotLookImageUrls(look));
  }
}

/**
 * 세션 화면의 내 마스코트 모습 미리 받기
 *
 * 화면이 열리면 카메라와 감지 모델을 먼저 받도록 한가할 때 받고, 종료 버튼을 누르면 돌려준 함수로 한 번 더 받는다.
 * 세션이 길면 그 사이 다른 기기에서 바꾼 모습도 종료 직전에 맞춘다.
 * 세션 화면은 조회 캐시를 직접 들고 있는 곳도 있어서 캐시를 받아 쓴다.
 */
export function useMascotLookPrefetch(queryClient: QueryClient, userId: number | null): () => void {
  useEffect(() => {
    whenIdle(() => void prefetchMyMascotLook(queryClient, userId));
  }, [queryClient, userId]);
  return () => void prefetchMyMascotLook(queryClient, userId);
}
