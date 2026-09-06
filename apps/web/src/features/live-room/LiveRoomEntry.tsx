import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { IceServer } from "@focusmakers/types";

import { ErrorState } from "@/components/ui/ErrorState";
import { joinErrorReason, rejoinFailure } from "@/features/social-room/joinErrorCopy";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { trackSocialRoomEntered, trackSocialRoomRejoinFailed } from "@/lib/amplitude";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { useNativeOrientationUnlock } from "@/lib/nativeBackGesture";
import { requestCameraGate } from "@/lib/nativeCameraGate";
import { useActiveSessionRestore } from "@/features/study-session/useActiveSessionRestore";
import { renewLiveRoomSeat } from "@/lib/roomApi";
import { profileQuery } from "@/lib/profileQueries";

import { LiveRoomSession } from "./LiveRoomSession";
import type { CreatePeerConnection } from "./peerMesh";
import type { CreateCamera, CreateChannel, LiveRoomLocationState } from "./liveRoomEntryState";

/**
 * 입장 준비 단계 — 세션이 아직 시작되지 않은 구간.
 *
 * 2026-08-24 BY-427: 입장 확인 모달을 제거하고 **무조건 카메라 끔(=측정 일시정지)으로
 * 즉시 입장**한다 — 카메라는 세션 안의 켜기 확인 모달로만 켠다. 준비 구간이 순공시간으로
 * 집계되면 안 되므로 측정 훅(세션)은 준비가 끝난 뒤에만 마운트되고, 프로필 조회도 같은
 * 이유로 이 단계에서 미리 한다 — 세션이 뜬 뒤 조회가 순공 구간에 끼어들지 않게. 마운트 시 join을 재호출해
 * 자리 예약 30초 TTL을 새로 잡고 iceServers를 갱신한다(모달이 없어져 체류 시간은 짧지만,
 * S9 응답 이후 흐른 시간과 무관하게 예약을 확실히 잡는 이유는 동일하다). 유예 재입장은
 * 재호출 없이 바로 들어가되, 카메라는 일반 입장과 같이 끔으로 시작한다.
 *
 * 카메라 어댑터는 여기서 만들어 세션에 그대로 넘긴다 — 미리보기가 없어져 start 지점은
 * 세션(useStudyRoomSession) 하나뿐이다(재오픈이 없으니 iOS 해제 지연 재시도도 불필요).
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
  // 입장 준비부터 세션 종료까지 룸 전체 수명 동안 회전을 연다 — 이 컴포넌트가 세션을
  // 자식으로 렌더하므로 여기가 룸 라우트의 수명과 같다(BY-412).
  useNativeOrientationUnlock();

  const navigate = useNavigate();
  const location = useLocation();

  const graceRejoin = entryState.graceRejoin === true;

  const [entered, setEntered] = useState(false);
  /**
   * 카메라 권한 게이트 결과 — 모든 입장 경로가 이 관문을 지난다(BY-412).
   *
   * 세션이 마운트되자마자 카메라를 획득하므로 그 전에 OS 권한을 확보해야 Android 웹뷰가
   * 묻지 않고 거부하는 경로를 피한다. 거부면 입장하지 않고 소셜 홈으로 돌아간다 — 네이티브가
   * 띄운 권한 안내 화면을 닫았을 때 그 아래에 이미 입장된 룸이 드러나면 안 되고, 룸은
   * 뒤로가기를 잠그고 있어 나가기 버튼 말고는 빠져나갈 수단도 없다(실기기 확인).
   *
   * 유예 재입장도 예외가 아니다 — 그 사이 사용자가 설정에서 권한을 껐을 수 있어, 여기만
   * 건너뛰면 "권한 없으면 룸에 들어가지 않는다"는 정책에 구멍이 생긴다.
   */
  // 브리지가 없으면(브라우저 단독) 물어볼 네이티브가 없다 — 초기값으로 통과시켜 입장이
  // 한 틱도 밀리지 않게 한다. 브리지가 있을 때만 응답을 기다린다.
  const [gatePassed, setGatePassed] = useState(() => !isNativeBridgeAvailable());
  const [gateDenied, setGateDenied] = useState(false);
  const [joined, setJoined] = useState(graceRejoin);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [iceServers, setIceServers] = useState<IceServer[]>(entryState.iceServers ?? []);

  const [camera] = useState(createCamera);

  // 세션이 마운트되기 전에 진행중 세션을 받아 둔다. 세션이 뜬 뒤에 받으면 타이머가 0에서 튄다.
  const { settled: restoreSettled, restored } = useActiveSessionRestore(userId);

  const profile = useQuery({
    ...profileQuery(userId),
    enabled: !entered,
  });

  // TTL 재예약 + iceServers 갱신. 실패하면 인라인 오류로 남고 [다시 시도]가 재실행한다.
  useEffect(() => {
    // 게이트를 지나기 전에는 자리를 잡지 않는다 — 권한이 거부되면 입장 자체를 하지 않으므로
    // 예약만 남기고 빠지는 일이 없어야 한다(BY-412).
    if (graceRejoin || !gatePassed) {
      return;
    }
    let cancelled = false;
    void renewLiveRoomSeat(userId, entryState.inviteCode)
      .then((response) => {
        if (!cancelled) {
          setIceServers(response.iceServers);
          setJoined(true);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const failure = rejoinFailure(error);
        // 자리 재예약 실패 계측(BY-472) — 재입장 버그 계열(BY-437/443)의 실사용 영향.
        trackSocialRoomRejoinFailed(failure.kind, joinErrorReason(error));
        // 이 방으로는 복구할 수 없는 실패(방 소멸 등)는 화면에 붙잡아 두면 사용자가
        // [다시 시도] 말고 할 수 있는 게 없는 상태에 갇힌다 — 사유만 남기고 내보낸다.
        if (failure.kind === "leave") {
          markSocialRoomNotice(failure.message);
          navigate(
            { pathname: "/social", search: location.search },
            { replace: true, state: { noticeHandoff: true } },
          );
          return;
        }
        setJoinError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, [
    entryState.inviteCode,
    gatePassed,
    graceRejoin,
    joinAttempt,
    location.search,
    navigate,
    userId,
  ]);

  // 마운트 1회 — StrictMode의 effect 이중 실행에서 게이트가 두 번 도는 것을 막는다.
  const gateRequestedRef = useRef(false);
  useEffect(() => {
    if (gateRequestedRef.current) {
      return;
    }
    gateRequestedRef.current = true;
    if (!isNativeBridgeAvailable()) {
      return;
    }
    void requestCameraGate().then((granted) => {
      if (granted) {
        setGatePassed(true);
      } else {
        setGateDenied(true);
      }
    });
  }, []);

  useEffect(() => {
    if (gateDenied) {
      navigate({ pathname: "/social", search: location.search }, { replace: true });
    }
  }, [gateDenied, location.search, navigate]);

  // 게이트를 지나고 join·프로필이 결착되면 입장 — 프로필은 실패해도 폴백(null)으로 진행한다.
  // 유예 재입장은 join을 부르지 않으므로(위 effect) 게이트만 통과하면 바로 들어간다.
  const profileSettled = profile.isSuccess || profile.isError;
  useEffect(() => {
    if (!entered && restoreSettled && gatePassed && (graceRejoin || (joined && profileSettled))) {
      setEntered(true);
      // 입장 계측(BY-472) — `!entered` 가드가 1회를 보장한다. 실제 입장(세션 마운트)
      // 시점이라 join 성공·게이트 통과까지 끝난 진짜 입장만 센다.
      trackSocialRoomEntered(graceRejoin);
    }
  }, [entered, gatePassed, graceRejoin, joined, profileSettled, restoreSettled]);

  if (!entered) {
    // 정상 경로는 수백 ms 수준이라 다크 배경만 유지한다(스피너 없음).
    return (
      <main
        data-testid="live-room-page"
        className="relative flex h-dvh flex-col bg-background"
        style={sessionSurfaceStyle}
      >
        {joinError !== null && (
          <div className="flex grow flex-col items-center justify-center gap-3 px-6">
            <ErrorState
              screen="live_room_entry"
              message={joinError}
              onRetry={() => {
                setJoinError(null);
                setJoinAttempt((attempt) => attempt + 1);
              }}
            />
            <button
              type="button"
              onClick={() =>
                navigate({ pathname: "/social", search: location.search }, { replace: true })
              }
              className="min-h-11 rounded-full bg-white/12 px-5 text-sm font-semibold text-white"
            >
              소셜 홈으로
            </button>
          </div>
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
      profile={profile.data ?? null}
      restored={restored}
    />
  );
}
