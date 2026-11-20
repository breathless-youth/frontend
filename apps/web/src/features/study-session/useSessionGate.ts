import { useIdentityPending, useUserId } from "@/lib/userId";

import { useActiveSessionRestore } from "./useActiveSessionRestore";
import { useInitialSubject } from "./useInitialSubject";

/**
 * 세션 진입 게이트
 *
 * 신원 대기, 서버 진행 기록 복원, 처음 과목 확인이 모두 끝난 뒤에 세션을 만들게 한다.
 * 먼저 만들면 사용자가 0분에서 복원값으로 튀는 것을 보고, 그 사이 스냅샷 보고가 낡은 시작 시각으로 나간다.
 * 신원이 오기 전에 만들면 세션 화면이 실제 번호로 다시 만들어지며 시작 계측이 두 번 나가고 타이머도 처음부터 선다.
 * 브라우저 단독 모드에는 기다릴 출처가 없어 신원 대기는 언제나 거짓이고, 앱은 3초 한도가 있어 갇히지 않는다.
 * 휴대폰 세션 화면과 PC 홈이 같은 규칙으로 세션을 연다.
 */
export function useSessionGate(candidate: number | undefined, prevalidated = false) {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const { settled, restored, failed } = useActiveSessionRestore(userId, { reportFailure: true });
  const initialSubject = useInitialSubject(
    identityPending ? null : userId,
    candidate,
    restored !== null,
    prevalidated,
  );
  const checked = !identityPending && settled;
  return {
    ready: checked && initialSubject.settled,
    userId,
    restored,
    initialSubjectId: initialSubject.subjectId,
    subjectError: checked && initialSubject.error,
    /** 진행 기록을 조회하지 못해 기록이 없는지 모른다. PC 이어 가기만 이 값으로 표시를 지울지 가른다. */
    restoreFailed: checked && failed === true,
    retrySubject: initialSubject.retry,
  };
}
