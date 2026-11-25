import type { ProfileResponse } from "@focusmakers/types";
import { useQuery } from "@tanstack/react-query";

import { profileQuery } from "@/lib/profileQueries";
import { useIdentityPending, useUserId } from "@/lib/userId";

export type PointsAccess =
  | { status: "pending" }
  | { status: "member"; userId: number }
  /** 신원은 있지만 회원으로 확인되지 않은 사용자이며 포인트를 받을 수 있고 사기와 꾸미기는 로그인 뒤에 한다. */
  | { status: "guest"; userId: number }
  | { status: "denied" };

/** 로그인 공급자가 값으로 온 프로필만 회원이다. 필드가 없는 옛 서버 응답은 회원으로 보지 않는다. */
export function isMemberProfile(profile: Pick<ProfileResponse, "loginProvider">): boolean {
  return typeof profile.loginProvider === "string";
}

/**
 * 포인트 화면을 누구로 여는지
 *
 * 신원이나 프로필이 오기 전에는 pending이고, 신원이 없으면 denied다.
 * 신원은 있는데 비회원이거나 공급자를 모르거나 프로필을 받지 못했으면 guest다.
 * guest가 화면을 볼 수 있는지는 서버가 조회를 열어 주는지로 정하고, 사기와 꾸미기는 회원으로 확인된 때만 한다.
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
    return { status: isMemberProfile(profile.data) ? "member" : "guest", userId };
  }
  return profile.isError ? { status: "guest", userId } : { status: "pending" };
}
