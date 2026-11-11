import type { ProfileResponse } from "@focusmakers/types";
import { useQuery } from "@tanstack/react-query";

import { profileQuery } from "@/lib/profileQueries";
import { useIdentityPending, useUserId } from "@/lib/userId";

export type PointsAccess =
  { status: "pending" } | { status: "member"; userId: number } | { status: "denied" };

/** 로그인 공급자가 값으로 온 프로필만 회원이다. 필드가 없는 옛 서버 응답은 회원으로 보지 않는다. */
export function isMemberProfile(profile: Pick<ProfileResponse, "loginProvider">): boolean {
  return typeof profile.loginProvider === "string";
}

/**
 * 포인트를 써도 되는 사용자인지
 *
 * 그룹 게이트는 판정하지 못하면 통과시키지만, 포인트는 잔액이 사용자에게 묶여 회원으로 확인된 때만 연다.
 * 신원이나 프로필이 오기 전에는 pending이고, 비회원·신원 없음·공급자 모름·조회 실패는 모두 denied다.
 * 다시 받기가 실패해도 이미 받은 프로필이 있으면 그 값으로 정한다.
 */
export function usePointsAccess(): PointsAccess {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const profile = useQuery({
    ...profileQuery(userId ?? 0),
    enabled: !identityPending && userId !== null,
  });
  if (identityPending) {
    return { status: "pending" };
  }
  if (userId === null) {
    return { status: "denied" };
  }
  if (profile.data !== undefined) {
    return isMemberProfile(profile.data) ? { status: "member", userId } : { status: "denied" };
  }
  return profile.isError ? { status: "denied" } : { status: "pending" };
}
