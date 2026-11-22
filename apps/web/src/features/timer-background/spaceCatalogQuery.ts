import { queryOptions } from "@tanstack/react-query";

import type { ShopItemResponse, ShopTagResponse } from "@/features/points/gateway/pointsApiTypes";
import { isMemberProfile } from "@/features/points/usePointsAccess";
import { getDecorations, getShopItems } from "@/lib/pointsApi";
import { profileQuery } from "@/lib/profileQueries";
import { queryClient } from "@/lib/queryClient";

import { type SpaceSelection, toSpaceSelection } from "./timerBackground";

/** 공간 페이지 타일이 될 서버 공간. 이름과 분류 이름은 화면 언어로 온다. */
export interface CatalogSpace {
  readonly selection: SpaceSelection;
  readonly name: string;
  readonly tags: readonly ShopTagResponse[];
}

export const spaceKeys = {
  catalog: (userId: number) => ["timer-background", "catalog", userId] as const,
  applied: (userId: number) => ["timer-background", "applied", userId] as const,
};

/**
 * 상품 한 줄을 공간으로 바꾸기
 *
 * 공간 페이지에는 가진 타이머 배경만 보인다.
 * 파일 위치가 없거나 앱이 그릴 수 없는 종류와 방식은 뺀다.
 */
export function toCatalogSpace(item: ShopItemResponse): CatalogSpace | null {
  if (item.category !== "TIMER_BACKGROUND" || !item.owned) return null;
  const selection = toSpaceSelection({
    itemId: item.id,
    code: item.code,
    assetKey: item.assetKey,
    assetType: item.assetType,
    videoMode: item.videoMode,
  });
  return selection === null ? null : { selection, name: item.name, tags: item.tags ?? [] };
}

/**
 * 공간 목록 queryOptions
 *
 * 상점과 같은 응답이지만 상점 변환은 무료 공간을 걸러서 따로 읽는다.
 * 상점 기능이 꺼진 문서에서도 읽는다.
 */
export function spaceCatalogQuery(userId: number) {
  return queryOptions({
    queryKey: spaceKeys.catalog(userId),
    queryFn: async () =>
      (await getShopItems()).items.flatMap((item) => {
        const space = toCatalogSpace(item);
        return space === null ? [] : [space];
      }),
    staleTime: 60_000,
  });
}

/**
 * 서버에 적용해 둔 공간 queryOptions
 *
 * 다른 기기에서 바꿨을 수 있어 늘 다시 읽는다.
 * 기본 배경이거나 앱이 그릴 수 없는 공간이면 null이다.
 */
export function appliedSpaceQuery(userId: number) {
  return queryOptions({
    queryKey: spaceKeys.applied(userId),
    queryFn: async () => {
      const applied = (await getDecorations()).timerBackground;
      return applied === null ? null : toSpaceSelection(applied);
    },
    staleTime: 0,
  });
}

/** 회원인지. 프로필을 받지 못하면 비회원으로 보고 서버에 저장하지 않는다. */
export function isMemberUser(userId: number | null): Promise<boolean> {
  if (userId === null) return Promise.resolve(false);
  return queryClient.fetchQuery(profileQuery(userId)).then(isMemberProfile, () => false);
}

/**
 * 세션 화면이 맞출 서버 공간
 *
 * 비회원은 서버에 묻지 않는다.
 * 비회원이거나 받지 못하면 undefined라 기기 값을 그대로 쓴다.
 */
export async function fetchAppliedSpace(
  userId: number | null,
): Promise<SpaceSelection | null | undefined> {
  if (userId === null || !(await isMemberUser(userId))) return undefined;
  return queryClient.fetchQuery(appliedSpaceQuery(userId)).catch(() => undefined);
}
