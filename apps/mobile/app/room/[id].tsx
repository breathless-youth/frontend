import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { RemoteScreen } from "../../components/RemoteScreen";
import { lockPortrait, unlockForSession } from "../../lib/orientation";

/**
 * 싱글룸 세션(S3-1~S3-8) — 화면 구현체는 `apps/web`이고 여기서는 `RemoteScreen`으로 원격
 * 경로를 로드한다(전 화면 원격 웹뷰 셸, BY-333). 타이머·상태 판정·이벤트 누적은 전부
 * 웹이 소유한다 — **여기에 세션 로직을 넣지 말 것.**
 *
 * 파라미터 조립(userId·appVersion)·브리지 수신(start-session·navigate-home·open-settings·
 * 세션 제출 대행)·초기 로딩 스플래시는 탭 3개와 동일하게 `RemoteScreen`이 공용으로 처리한다
 * (`lib/remoteQueryParams.ts`·`lib/nativeBridgeHandler.ts`·`lib/sessionSubmitRelay.ts`).
 *
 * 탭 화면과 다른 점은 `blockHardwareBack` 하나다 — 세션 중 안드로이드 뒤로가기로 WebView가
 * 파괴되면 측정한 시간이 통째로 사라진다(사유는 `RemoteScreen`의 prop 주석).
 */
export default function SessionRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // 세션만 회전을 연다(S3-5·S3-6 가로 거치) — 화면 방향 정책의 실제 집행은 rn-screens가 아니라
  // expo-screen-orientation이 한다(`lib/orientation.ts`의 P0-3 정정 참고). 언마운트 시 다시
  // 세로로 잠근다 — 가로인 채 홈으로 돌아오면 잠금이 즉시 세로로 되돌린다.
  useEffect(() => {
    unlockForSession();
    return () => {
      lockPortrait();
    };
  }, []);

  return (
    <>
      {/* 세션 화면은 시스템 테마와 무관하게 항상 다크다 — 상태 바 아이콘도 밝게 고정한다
          (라이트 모드 기기에서 `style="auto"`가 어두운 아이콘을 골라 배경에 묻힌다). */}
      <StatusBar style="light" />
      <RemoteScreen
        testID="session-webview"
        path={`/room/${id ?? "1"}`}
        backgroundColor="#0B0F14"
        blockHardwareBack
      />
    </>
  );
}
