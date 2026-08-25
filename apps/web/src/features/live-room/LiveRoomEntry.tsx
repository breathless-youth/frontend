import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { IceServer } from "@focusmakers/types";

import { ErrorState } from "@/components/ui/ErrorState";
import { rejoinFailure } from "@/features/social-room/joinErrorCopy";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { joinRoom } from "@/lib/roomApi";
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
 * 이유로 이 단계에서만 한다 — 세션 중 API 호출 금지 계약. 마운트 시 join을 재호출해
 * 자리 예약 30초 TTL을 새로 잡고 iceServers를 갱신한다(모달이 없어져 체류 시간은 짧지만,
 * S9 응답 이후 흐른 시간과 무관하게 예약을 확실히 잡는 이유는 동일하다). 유예 재입장은
 * 재호출 없이 서버가 준 이전 카메라 상태로 바로 들어간다.
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
  const navigate = useNavigate();
  const location = useLocation();

  const graceRejoin = entryState.graceRejoin === true;
  // 일반 입장은 무조건 끔(일시정지 시작), 유예 재입장만 이전 카메라 상태 복원(기본 켬).
  const initialCameraOn = graceRejoin ? entryState.cameraOn !== false : false;

  const [entered, setEntered] = useState(graceRejoin);
  const [joined, setJoined] = useState(graceRejoin);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [iceServers, setIceServers] = useState<IceServer[]>(entryState.iceServers ?? []);

  const [camera] = useState(createCamera);

  const profile = useQuery({
    ...profileQuery(userId),
    staleTime: Infinity,
    enabled: !entered,
  });

  // TTL 재예약 + iceServers 갱신. 실패하면 인라인 오류로 남고 [다시 시도]가 재실행한다.
  useEffect(() => {
    if (graceRejoin) {
      return;
    }
    let cancelled = false;
    void joinRoom(userId, entryState.inviteCode)
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
        // 이 방으로는 복구할 수 없는 실패(방 소멸 등)는 화면에 붙잡아 두면 사용자가
        // [다시 시도] 말고 할 수 있는 게 없는 상태에 갇힌다 — 사유만 남기고 내보낸다.
        if (failure.kind === "leave") {
          markSocialRoomNotice(failure.message);
          navigate({ pathname: "/social", search: location.search }, { replace: true });
          return;
        }
        setJoinError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, [entryState.inviteCode, graceRejoin, joinAttempt, location.search, navigate, userId]);

  // join과 프로필이 모두 결착되면 입장 — 프로필은 실패해도 폴백(null)으로 진행한다.
  const profileSettled = profile.isSuccess || profile.isError;
  useEffect(() => {
    if (!entered && joined && profileSettled) {
      setEntered(true);
    }
  }, [entered, joined, profileSettled]);

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
      initialCameraOn={initialCameraOn}
      profile={profile.data ?? null}
    />
  );
}
