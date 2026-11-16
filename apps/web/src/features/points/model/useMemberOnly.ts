import { isMemberOnlyError } from "../gateway/memberOnly";
import { usePointsMembership } from "../gateway/PointsGatewayContext";

/**
 * 회원만 할 수 있는 일의 문
 *
 * 비회원은 포인트 화면을 구경하고 미리 입혀 볼 수 있지만, 받기와 사기와 꾸미기 저장은 로그인 뒤에 한다.
 * `allow`는 비회원이면 로그인 화면을 열고 false를 줘서, 부른 쪽이 창을 띄우거나 요청을 보내기 전에 멈춘다.
 * `redirected`는 회원으로 알았는데 서버가 회원 전용이라고 거절한 경우를 같은 로그인 화면으로 보낸다.
 */
export function useMemberOnly(): {
  allow: () => boolean;
  redirected: (error: unknown) => boolean;
} {
  const { member, requestLogin } = usePointsMembership();
  return {
    allow: () => {
      if (!member) {
        requestLogin();
      }
      return member;
    },
    redirected: (error) => {
      if (!isMemberOnlyError(error)) {
        return false;
      }
      requestLogin();
      return true;
    },
  };
}
