import type { ProfileResponse, SocialLoginProvider } from "@focusmakers/types";
import { useQuery } from "@tanstack/react-query";

import { nativeSocialLoginProviders } from "@/lib/nativeSocialLogin";
import { profileQuery } from "@/lib/profileQueries";
import { useIdentityPending, useUserId } from "@/lib/userId";

export type GroupAccess = "ungated" | "pending" | "member" | "guest";

/**
 * 로그인한 공급자가 실린 프로필 응답
 *
 * 백엔드 Swagger에 아직 없는 필드라 공유 타입에 넣지 않고 이 판정에서만 쓴다.
 * 비회원이면 null이고, 이 필드를 배포하기 전 서버의 응답에는 아예 없다.
 */
type ProfileWithLogin = ProfileResponse & { loginProvider?: SocialLoginProvider | null };

/**
 * 그룹 화면을 열어도 되는지 판정
 *
 * 로그인 공급자를 알리지 않은 옛 앱과 브라우저는 그룹이 로그인보다 먼저 비회원에게 나가므로 막지 않는다.
 * 신원과 프로필이 오기 전에는 정하지 않아서 그룹 화면도 로그인 화면도 잠깐 비치지 않는다.
 * 앱이 끝내 주지 않은 신원, 로그인 필드가 없는 서버의 응답, 받지 못한 프로필은 막지 않는다.
 * 서버가 비회원의 그룹 요청을 막지 않아서, 판정하지 못해 모두를 가두는 것보다 통과시키는 편이 낫다.
 */
export function useGroupAccess(): GroupAccess {
  const gated = nativeSocialLoginProviders().length > 0;
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const profile = useQuery({
    ...profileQuery(userId ?? 0),
    enabled: gated && !identityPending && userId !== null,
  });
  if (!gated) {
    return "ungated";
  }
  if (identityPending) {
    return "pending";
  }
  if (userId === null) {
    return "ungated";
  }
  if (profile.isPending) {
    return "pending";
  }
  return (profile.data as ProfileWithLogin | undefined)?.loginProvider === null
    ? "guest"
    : "member";
}
