import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { IceServer } from "@focusmakers/types";

import { CameraOnConfirmDialog } from "@/features/live-room/components/CameraOnConfirmDialog";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { joinErrorMessage } from "@/features/social-room/joinErrorCopy";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { joinRoom } from "@/lib/roomApi";
import { profileQuery } from "@/lib/profileQueries";
import { cn } from "@/lib/utils";

import { LiveRoomSession } from "./LiveRoomSession";
import type { CreateCamera, CreateChannel, LiveRoomLocationState } from "./liveRoomEntryState";

/**
 * 입장 확인 단계 — 세션이 아직 시작되지 않은 구간.
 *
 * 확인 모달에서 머문 시간이 순공시간으로 집계되면 안 되므로, 측정 훅(세션)은 입장이
 * 확정된 뒤에만 마운트된다. 프로필 조회도 같은 이유로 이 단계에서만 한다 — 세션 중
 * API 호출 금지 계약. 확정 시점에 join을 재호출해 자리 예약 30초 TTL을 새로 잡는다 —
 * 모달에서 얼마나 머물러도 TTL이 문제되지 않는다. 유예 재입장은 모달을 건너뛰고 이전
 * 카메라 상태로 들어간다.
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

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  // 어댑터 하나를 미리보기와 세션이 이어서 쓴다 — 미리보기를 닫고 세션이 다시 열면
  // iOS 웹뷰에서 카메라 해제가 늦어 재오픈이 실패한다(실기기 실측). 입장 확정 시
  // 정지 없이 세션으로 넘긴다.
  const [previewCamera] = useState(createCamera);
  const handedOverRef = useRef(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const modalOpen = entry === null;
  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const attach = () => {
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = previewCamera.stream ?? null;
      }
    };
    void previewCamera.start().then(() => {
      if (cancelled) {
        return;
      }
      if (previewCamera.isRunning) {
        attach();
        return;
      }
      // 직전 세션이 방금 끝났으면 웹뷰가 카메라를 아직 안 놓아 첫 획득이 실패한다
      // (실기기 실측) — 잠깐 뒤 한 번만 다시 연다.
      retryTimer = setTimeout(() => {
        void previewCamera.start().then(() => {
          if (cancelled) {
            return;
          }
          if (previewCamera.isRunning) {
            attach();
          } else {
            setPreviewFailed(true);
          }
        });
      }, 700);
    });
    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
      if (!handedOverRef.current) {
        previewCamera.stop();
      }
    };
  }, [modalOpen, previewCamera]);

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
    handedOverRef.current = true;
    setEntry({ cameraOn });
  }

  if (entry === null) {
    return (
      <main
        data-testid="live-room-page"
        className="relative flex h-dvh flex-col bg-background"
        style={sessionSurfaceStyle}
      >
        <CameraOnConfirmDialog
          dismissable={false}
          busy={joining}
          preview={
            <video
              ref={previewVideoRef}
              data-testid="entry-preview-video"
              autoPlay
              playsInline
              muted
              className={cn(
                "amp-block sentry-block size-full object-cover",
                previewCamera.facing === "front" && "scale-x-[-1]",
              )}
            />
          }
          // TODO: 카메라 실패 문구는 voice-tone 미등재 임시안 — 입장 실패(join) 오류가 우선이다.
          errorMessage={
            entryError ?? (previewFailed ? "카메라를 켜지 못했어요. 끄고도 입장은 가능해요." : null)
          }
          cancelLabel="끄고 입장"
          onCancel={() => void confirmEntry(false)}
          onConfirm={() => void confirmEntry(true)}
        />
      </main>
    );
  }

  return (
    <LiveRoomSession
      roomId={roomId}
      userId={userId}
      createChannel={createChannel}
      camera={previewCamera}
      createPeerConnection={createPeerConnection}
      iceServers={iceServers}
      initialCameraOn={entry.cameraOn}
      profile={profile.data ?? null}
    />
  );
}
