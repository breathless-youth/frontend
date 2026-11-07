import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { IceServer } from "@focusmakers/types";

import { ErrorState } from "@/components/ui/ErrorState";
import { toRoomVisibility } from "@/features/group-room/fromApi";
import { groupErrorCopy, isGroupGoneError } from "@/features/group-room/groupErrorCopy";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { joinErrorReason, rejoinFailure } from "@/features/social-room/joinError";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { trackSocialRoomEntered, trackSocialRoomRejoinFailed } from "@/lib/amplitude";
import { trackMetaSocialRoomEntered } from "@/lib/metaAppEvents";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { useNativeOrientationUnlock } from "@/lib/nativeBackGesture";
import { requestCameraGate } from "@/lib/nativeCameraGate";
import { useActiveSessionRestore } from "@/features/study-session/useActiveSessionRestore";
import { groupHomeQuery } from "@/lib/groupRoomQueries";
import { profileQuery } from "@/lib/profileQueries";

import { LiveRoomSession } from "./LiveRoomSession";
import { useInitialSubject } from "@/features/study-session/useInitialSubject";
import { InitialSubjectError } from "@/features/study-session/InitialSubjectError";
import type { CreatePeerConnection } from "./peerMesh";
import type { CreateCamera, CreateChannel } from "./liveRoomEntryState";
import type { LiveRoomKind } from "./roomKind";
import { liveRoomHomePath, renewRoomSeat } from "./roomKind";
import type { RoomAudioDeps } from "./useRoomAudio";

/**
 * 사라진 그룹에서 그룹 탭으로 돌아가기
 *
 * 그룹 화면들과 같은 훅이 안내와 캐시 정리를 맡게 하려고, 그룹 공부방에서만 그리는 빈 부품에 둔다.
 */
function LeaveWhenGroupGone({ error, groupId }: { error: unknown; groupId: number }) {
  useLeaveWhenGone(error, groupId);
  return null;
}

/**
 * 입장 준비 단계 — 세션이 아직 시작되지 않은 구간.
 *
 * 입장 확인 모달을 제거하고 무조건 카메라 끔(=측정 일시정지)으로 즉시 입장한다
 * — 카메라는 세션 안의 켜기 확인 모달로만 켠다. 준비 구간이 순공시간으로
 * 집계되면 안 되므로 측정 훅(세션)은 준비가 끝난 뒤에만 마운트되고, 프로필 조회도 같은 이유로 이 단계에서 미리 한다
 * — 세션이 뜬 뒤 조회가 순공 구간에 끼어들지 않게. 마운트 시 join을 재호출해
 * 자리 예약 30초 TTL을 새로 잡고 iceServers를 갱신한다(모달이 없어져 체류 시간은 짧지만,
 * 응답 이후 흐른 시간과 무관하게 예약을 확실히 잡는 이유는 동일하다). 유예 재입장은
 * 재호출 없이 바로 들어가되, 카메라는 일반 입장과 같이 끔으로 시작한다.
 *
 * 카메라 어댑터는 여기서 만들어 세션에 그대로 넘긴다 — 미리보기가 없어져 start 지점은
 * 세션(useStudyRoomSession) 하나뿐이다(재오픈이 없으니 iOS 해제 지연 재시도도 불필요).
 *
 * 세션은 자리 잡기 응답의 방 번호로 연다.
 * 그룹 공부방은 방이 닫혔다 다시 열리면 방 번호가 바뀌고, 주소로만 다시 열면 방 번호가 없어서다.
 */
export function LiveRoomEntry({
  room,
  initialRoomId,
  userId,
  graceRejoin,
  initialIceServers,
  initialSubjectId,
  initialSubjectVerified,
  createChannel,
  createCamera,
  createPeerConnection,
  audioDeps,
}: {
  room: LiveRoomKind;
  /** 그룹 공부방을 주소로만 다시 열면 이 값이 없어서 자리 잡기 응답으로 받는다. */
  initialRoomId: number | null;
  userId: number;
  graceRejoin: boolean;
  initialIceServers: IceServer[];
  initialSubjectId?: number;
  initialSubjectVerified?: { userId: number; subjectId: number; validUntil: number };
  createChannel: CreateChannel;
  createCamera: CreateCamera;
  createPeerConnection?: CreatePeerConnection;
  audioDeps?: RoomAudioDeps;
}) {
  // 입장 준비부터 세션 종료까지 룸 전체 수명 동안 화면 회전을 연다
  // — 이 컴포넌트가 세션을 자식으로 렌더하므로 여기가 룸 라우트의 수명과 같다.
  useNativeOrientationUnlock();
  const { t } = useTranslation("live-room");

  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const homePath = liveRoomHomePath(room);

  const [entered, setEntered] = useState(false);
  /**
   * 카메라 권한 게이트 결과 — 모든 입장 경로가 이 관문을 지난다.
   *
   * 세션이 마운트되자마자 카메라를 획득하므로 그 전에 OS 권한을 확보해야 Android 웹뷰가
   * 묻지 않고 거부하는 경로를 피한다. 거부면 입장하지 않고 공부방을 연 홈으로 돌아간다
   * — 네이티브가 띄운 권한 안내 화면을 닫았을 때 그 아래에 이미 입장된 룸이 드러나면 안 되고,
   * 룸은 뒤로가기를 잠그고 있어 나가기 버튼 말고는 빠져나갈 수단도 없다 (유예 재입장도 예외가 아니다).
   */
  // 브리지가 없으면(브라우저 단독) 물어볼 네이티브가 없다 — 초기값으로 통과시켜 입장이
  // 한 틱도 밀리지 않게 한다. 브리지가 있을 때만 응답을 기다린다.
  const [gatePassed, setGatePassed] = useState(() => !isNativeBridgeAvailable());
  const [gateDenied, setGateDenied] = useState(false);
  const [joined, setJoined] = useState(graceRejoin);
  const [joinError, setJoinError] = useState<string | null>(null);
  // 그룹이 사라졌거나 멤버가 아니라는 실패는 화면에 붙잡지 않고 그룹 탭으로 돌려보낸다.
  const [groupGoneError, setGroupGoneError] = useState<unknown>(null);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [iceServers, setIceServers] = useState<IceServer[]>(initialIceServers);
  const [roomId, setRoomId] = useState(initialRoomId);

  const [camera] = useState(createCamera);

  // 세션이 마운트되기 전에 진행중 세션을 받아 둔다. 세션이 뜬 뒤에 받으면 타이머가 0에서 튄다.
  const { settled: restoreSettled, restored } = useActiveSessionRestore(userId);
  const [mountedAt] = useState(() => Date.now());
  const [proofExpired, setProofExpired] = useState(false);
  const proofValidUntil = initialSubjectVerified?.validUntil;
  const proofMatches =
    initialSubjectId !== undefined &&
    initialSubjectVerified?.userId === userId &&
    initialSubjectVerified.subjectId === initialSubjectId &&
    proofValidUntil !== undefined &&
    proofValidUntil >= mountedAt &&
    proofValidUntil <= mountedAt + 30000;
  useEffect(() => {
    if (entered || !proofMatches || proofValidUntil === undefined) return;
    const timer = setTimeout(
      () => setProofExpired(true),
      Math.max(0, proofValidUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [entered, proofMatches, proofValidUntil]);
  const prevalidated = proofMatches && !proofExpired;
  const initialSubject = useInitialSubject(
    userId,
    initialSubjectId,
    restored !== null,
    prevalidated,
  );

  const profile = useQuery({
    ...profileQuery(userId),
    enabled: !entered,
  });

  // TTL 재예약 + iceServers 갱신. 실패하면 인라인 오류로 남고 [다시 시도]가 재실행한다.
  useEffect(() => {
    // 게이트를 지나기 전에는 자리를 잡지 않는다 — 권한이 거부되면 입장 자체를 하지 않으므로
    // 예약만 남기고 빠지는 일이 없어야 한다(BY-412).
    if (graceRejoin || !gatePassed || !restoreSettled || !initialSubject.settled) {
      return;
    }
    let cancelled = false;
    void renewRoomSeat(room)
      .then((seat) => {
        if (!cancelled) {
          setIceServers(seat.iceServers);
          setRoomId(seat.roomId);
          setJoined(true);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (room.kind === "group") {
          if (isGroupGoneError(error)) {
            setGroupGoneError(error);
          } else {
            setJoinError(groupErrorCopy("load", error));
          }
          return;
        }
        const failure = rejoinFailure(error);
        // 자리 재예약 실패 계측(BY-472) — 재입장 버그 계열(BY-437/443)의 실사용 영향.
        trackSocialRoomRejoinFailed(failure.kind, joinErrorReason(error));
        // 이 방으로는 복구할 수 없는 실패(방 소멸 등)는 화면에 붙잡아 두면 사용자가
        // — 사유만 남기고 내보낸다.
        if (failure.kind === "leave") {
          markSocialRoomNotice({ kind: "failure", message: failure.message });
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
    gatePassed,
    graceRejoin,
    joinAttempt,
    location.search,
    navigate,
    room,
    userId,
    restoreSettled,
    initialSubject.settled,
  ]);

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
      navigate({ pathname: homePath, search: location.search }, { replace: true });
    }
  }, [gateDenied, homePath, location.search, navigate]);

  // 게이트를 지나고 join·프로필이 결합되면 입장
  // 유예 재입장은 join을 부르지 않으므로(위 effect) 게이트만 통과하면 바로 들어간다.
  const profileSettled = profile.isSuccess || profile.isError;
  const ready =
    restoreSettled &&
    initialSubject.settled &&
    gatePassed &&
    roomId !== null &&
    (graceRejoin || (joined && profileSettled));
  // 입장은 래치다.
  // 조건이 나중에 거짓이 돼도 세션을 내리지 않는다.
  if (!entered && ready) {
    setEntered(true);
  }
  const trackEntered = useEffectEvent(() => {
    // 입장 계측(BY-472) — `!entered` 가드가 1회를 보장한다. 실제 입장(세션 마운트)
    // 시점이라 join 성공·게이트 통과까지 끝난 진짜 입장만 센다.
    // 래치는 되돌아가지 않아 entered 전환은 한 번뿐이고, 계측은 그 전환에만 반응한다.
    // 그룹 공부방의 공개 여부는 들어오기 전에 연 그룹 홈이 받아 둔 응답에서 읽고, 없으면 싣지 않는다.
    const home =
      room.kind === "group"
        ? queryClient.getQueryData(groupHomeQuery(userId, room.groupId).queryKey)
        : undefined;
    if (home === undefined) {
      trackSocialRoomEntered(graceRejoin);
    } else {
      trackSocialRoomEntered(graceRejoin, { visibility: toRoomVisibility(home.visibility) });
    }
    // Meta 광고 전환 — 유예 재입장은 새 입장이 아니라 세지 않는다.
    // 그룹 공부방 입장은 소셜룸 입장 전환으로 보내지 않아서 초대코드 방 입장만 센다.
    if (!graceRejoin && room.kind === "invite") trackMetaSocialRoomEntered();
  });
  useEffect(() => {
    if (!entered) return;
    trackEntered();
  }, [entered]);

  if (!entered || roomId === null) {
    return (
      <main
        data-testid="live-room-page"
        className="theme-dark relative flex h-dvh flex-col bg-background"
        style={sessionSurfaceStyle}
      >
        {restoreSettled && initialSubject.error && (
          <InitialSubjectError
            onRetry={initialSubject.retry}
            onBack={() =>
              navigate({ pathname: homePath, search: location.search }, { replace: true })
            }
          />
        )}
        {room.kind === "group" && (
          <LeaveWhenGroupGone error={groupGoneError} groupId={room.groupId} />
        )}
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
                navigate({ pathname: homePath, search: location.search }, { replace: true })
              }
              className="min-h-11 rounded-full bg-white/12 px-5 text-sm font-semibold text-white"
            >
              {room.kind === "group" ? t("entry.backToGroup") : t("entry.backToSocial")}
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
      room={room}
      createChannel={createChannel}
      camera={camera}
      createPeerConnection={createPeerConnection}
      iceServers={iceServers}
      profile={profile.data ?? null}
      restored={restored}
      initialSubjectId={initialSubject.subjectId}
      audioDeps={audioDeps}
    />
  );
}
