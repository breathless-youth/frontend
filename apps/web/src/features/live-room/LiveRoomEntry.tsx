import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { IceServer } from "@focusmakers/types";

import { CameraOnConfirmDialog } from "@/features/live-room/components/CameraOnConfirmDialog";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { joinErrorMessage } from "@/features/social-room/joinErrorCopy";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useNativeOrientationUnlock } from "@/lib/nativeBackGesture";
import { requestCameraGate } from "@/lib/nativeCameraGate";
import { joinRoom } from "@/lib/roomApi";
import { profileQuery } from "@/lib/profileQueries";

import { LiveRoomSession } from "./LiveRoomSession";
import type { CreateCamera, CreateChannel, LiveRoomLocationState } from "./liveRoomEntryState";

/**
 * 입장 단계 — 세션이 아직 시작되지 않은 구간.
 *
 * ## 미리보기 없이 카메라 꺼짐으로 입장한다 (2026-08-25 확정, iOS·Android 공통)
 *
 * 예전에는 카메라 미리보기 모달에서 켜고/끄고를 골라 입장했다. 그 미리보기 획득이 권한
 * 흐름과 얽혀 입장 자체가 깨지는 문제가 Android에서 반복됐고, 켜고 입장이 기본이면 룸에
 * 들어가기까지의 단계도 하나 더 는다. 그래서 **모달을 띄우지 않고 카메라 꺼짐으로 바로
 * 입장한다.** 카메라는 룸 안 컨트롤 바 토글로 켠다.
 *
 * 입장 전에 권한 게이트는 그대로 태운다: 세션이 마운트되자마자 카메라를 획득하므로
 * (`useStudyRoomSession`), 그 전에 OS 권한을 확보해야 Android 웹뷰가 묻지 않고 거부하는
 * 경로를 피한다. **게이트가 거부면 입장하지 않고 소셜 홈으로 돌아간다** — 권한 없이는 룸에
 * 들어가지 않는다는 정책이고(BY-412 완료 조건), 네이티브가 띄운 권한 안내 화면을 사용자가
 * 닫았을 때 그 아래에 이미 입장된 룸이 드러나서도 안 된다. 룸은 뒤로가기를 잠그고 있어
 * (`set-back-lock`) 나가기 버튼 말고는 빠져나갈 수단도 없다(2026-08-25 실기기 확인).
 * 게이트가 응답을 못 주는 경우의 판단은 `lib/nativeCameraGate.ts`가 셸 표시로 가른다.
 *
 * 측정 훅(세션)은 입장이 확정된 뒤에만 마운트되고, 프로필 조회도 이 단계에서만 한다 —
 * 세션 중 API 호출 금지 계약. 입장 시 join을 재호출해 자리 예약 30초 TTL을 새로 잡는다.
 * 유예 재입장은 join 없이 이전 카메라 상태로 들어간다.
 */
export function LiveRoomEntry({
  roomId,
  userId,
  entryState,
  createChannel,
  createCamera,
  createPeerConnection,
}: {
  roomId: number;
  userId: number;
  entryState: LiveRoomLocationState;
  createChannel: CreateChannel;
  createCamera: CreateCamera;
  createPeerConnection?: CreatePeerConnection;
}) {
  // 입장부터 세션 종료까지 룸 전체 수명 동안 회전을 연다 — 이 컴포넌트가 세션
  // (`LiveRoomSession`)을 자식으로 렌더하므로 여기가 룸 라우트의 수명과 같다.
  useNativeOrientationUnlock();
  const [entry, setEntry] = useState<{ cameraOn: boolean } | null>(
    entryState.graceRejoin === true ? { cameraOn: entryState.cameraOn !== false } : null,
  );
  const [entryError, setEntryError] = useState<string | null>(null);
  const [iceServers, setIceServers] = useState<IceServer[]>(entryState.iceServers ?? []);

  const profile = useQuery({
    ...profileQuery(userId),
    staleTime: Infinity,
    enabled: entry === null,
  });

  // 세션에 넘길 카메라 어댑터. 입장 단계에서는 시작하지 않는다(위 주석 참고).
  const [camera] = useState(createCamera);

  // 확정 처리 중의 경쟁 상태 방지
  const [joining, setJoining] = useState(false);
  async function confirmEntry(cameraOn: boolean) {
    if (joining) {
      return;
    }
    setJoining(true);
    try {
      const joined = await joinRoom(userId, entryState.inviteCode);
      setIceServers(joined.iceServers);
    } catch (error) {
      setEntryError(joinErrorMessage(error));
      setJoining(false);
      return;
    }
    setEntry({ cameraOn });
  }

  // 권한 게이트가 거부한 상태 — 입장하지 않고 소셜 홈으로 돌아간다(위 주석).
  const [gateDenied, setGateDenied] = useState(false);
  const location = useLocation();

  // 마운트 시 자동 입장 — 게이트로 OS 권한을 먼저 확보한 뒤 카메라 꺼짐으로 들어간다.
  // ref 가드는 StrictMode의 effect 이중 실행에서 join이 두 번 나가는 것을 막는다
  // (`joining` state는 같은 틱의 두 호출을 거르지 못한다).
  const autoEntryRef = useRef(false);
  useEffect(() => {
    if (entry !== null || autoEntryRef.current) {
      return;
    }
    autoEntryRef.current = true;
    void (async () => {
      if (!(await requestCameraGate())) {
        setGateDenied(true);
        return;
      }
      await confirmEntry(false);
    })();
    // 마운트 1회만 — confirmEntry는 렌더마다 새 함수라 deps에 넣으면 재실행된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gateDenied) {
    // 쿼리를 승계한다 — 셸 계약 파라미터(userId 등)가 빠지면 소셜 홈이 다시 못 뜬다.
    return <Navigate to={{ pathname: "/social", search: location.search }} replace />;
  }

  if (entry === null) {
    return (
      <main
        data-testid="live-room-page"
        className="relative flex h-dvh flex-col bg-background"
        style={sessionSurfaceStyle}
      >
        {/* 자동 입장 실패(join 오류)일 때만 다이얼로그를 띄운다 — 미리보기는 없다. */}
        {entryError !== null && (
          <CameraOnConfirmDialog
            dismissable={false}
            busy={joining}
            preview={null}
            errorMessage={entryError}
            cancelLabel="끄고 입장"
            onCancel={() => void confirmEntry(false)}
            onConfirm={() => void confirmEntry(true)}
          />
        )}
      </main>
    );
  }

  return (
    <LiveRoomSession
      roomId={roomId}
      userId={userId}
      createChannel={createChannel}
      camera={camera}
      createPeerConnection={createPeerConnection}
      iceServers={iceServers}
      initialCameraOn={entry.cameraOn}
      profile={profile.data ?? null}
    />
  );
}
