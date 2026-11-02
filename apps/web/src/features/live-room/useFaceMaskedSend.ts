import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

import type { VisionFocusDetector } from "@/features/study-session/adapters/focusDetector";
import type { FaceSpot } from "@/features/study-session/vision/faceSpot";
import {
  trackSocialRoomFaceMaskEmojiSelected,
  trackSocialRoomFaceMaskToggled,
} from "@/lib/amplitude";

import type { FaceMaskedStream, FaceMaskedStreamStats } from "./faceMaskedStream";
import { createFaceMaskedStream } from "./faceMaskedStream";
import {
  faceMaskEmojiOf,
  readFaceMaskEmojiId,
  readFaceMaskOn,
  writeFaceMaskEmojiId,
  writeFaceMaskOn,
} from "./faceMaskSettings";

export interface FaceMaskedSend {
  readonly supported: boolean;
  readonly on: boolean;
  setOn(on: boolean): void;
  readonly emojiId: string;
  setEmojiId(id: string): void;
  readonly faceSpot: FaceSpot | null;
  /** 합성 스트림. 미지원이면 null */
  readonly maskedStream: MediaStream | null;
  /** 상대에게 보낼 스트림. 카메라가 없으면 null */
  readonly sendStream: MediaStream | null;
  /** 개발 빌드 디버그 줄. 운영 빌드나 미지원이면 빈 문자열 */
  readonly debugLine: string;
}

/** 합성기를 만들기 전에는 켜 둔 선택이면 아무것도 보내지 않아, 원본이 잠깐이라도 나가지 않게 한다. */
function sendStreamOf(
  cameraStream: MediaStream | null,
  compositor: FaceMaskedStream | null | undefined,
  preferredOn: boolean,
): MediaStream | null {
  if (cameraStream === null || !preferredOn) {
    return cameraStream;
  }
  if (compositor === undefined) {
    return null;
  }
  return compositor === null ? cameraStream : compositor.stream;
}

/**
 * 소셜룸 송신 영상의 얼굴 가리기
 *
 * 합성기를 만들고, 감지기의 이모지 자리를 넘기고, 스위치와 카메라 상태에 따라 합성을 켜고 끈다.
 * 보낼 스트림은 가리기가 켜져 있고 합성을 쓸 수 있을 때만 합성 스트림이다.
 * `active`는 카메라가 켜져 있거나 켜기 확인 창이 열려 있을 때 참이고, 거짓이면 보낼 것도 보여 줄 것도 없어 그리지 않는다.
 */
export function useFaceMaskedSend({
  sourceRef,
  visionDetector,
  cameraStream,
  active,
  createCompositor = createFaceMaskedStream,
}: {
  sourceRef: RefObject<HTMLVideoElement | null>;
  visionDetector: Pick<
    VisionFocusDetector,
    "subscribeFaceSpot" | "preload" | "faceStatus" | "subscribeFaceStatus"
  >;
  cameraStream: MediaStream | null;
  active: boolean;
  createCompositor?: typeof createFaceMaskedStream;
}): FaceMaskedSend {
  // undefined는 아직 만들기 전, null은 이 기기에서 쓸 수 없다는 뜻이다.
  const [compositor, setCompositor] = useState<FaceMaskedStream | null | undefined>(undefined);
  const [create] = useState(() => createCompositor);
  // GPU 자원이라 effect에서 만들고 정리 함수에서 해제한다.
  // StrictMode가 effect를 한 번 더 돌려도 해제된 합성기 대신 새로 만든 것을 쓴다.
  useEffect(() => {
    const created = create(() => sourceRef.current);
    setCompositor(created);
    return () => created?.dispose();
  }, [create, sourceRef]);
  const supported = compositor != null;
  const [preferredOn, setPreferredOn] = useState(readFaceMaskOn);
  const on = supported && preferredOn;
  const [emojiId, setEmojiIdState] = useState(readFaceMaskEmojiId);
  const [detectedSpot, setDetectedSpot] = useState<FaceSpot | null>(null);
  // 카메라가 바뀌면 이전 영상에서 구한 자리는 새 영상과 맞지 않는다.
  // 렌더 중에 비워서, 새 스트림을 숨은 원본에 붙이는 호출부 효과보다 이 훅의 합성기 효과가 먼저 null을 넘기게 한다.
  const [spotStream, setSpotStream] = useState(cameraStream);
  if (spotStream !== cameraStream) {
    setSpotStream(cameraStream);
    setDetectedSpot(null);
  }
  const faceStatus = useSyncExternalStore(
    visionDetector.subscribeFaceStatus,
    () => visionDetector.faceStatus,
  );
  // 얼굴 모델 없이 사람 범위로 어림한 자리는 얼굴을 비껴갈 수 있다.
  // 상대에게 가는 영상이라 얼굴 모델이 준비된 동안에만 이모지를 쓰고 나머지는 흐린다.
  const faceSpot = faceStatus === "ready" ? detectedSpot : null;

  useEffect(() => visionDetector.subscribeFaceSpot(setDetectedSpot), [visionDetector]);
  useEffect(() => compositor?.setSpot(faceSpot), [compositor, faceSpot]);
  useEffect(() => compositor?.setSticker(faceMaskEmojiOf(emojiId).url), [compositor, emojiId]);
  // 스위치를 끄면 원본을 보내므로 그리기도 멈춘다.
  useEffect(() => {
    if (!on || !active || compositor == null) {
      return;
    }
    compositor.start();
    return () => compositor.pause();
  }, [compositor, on, active]);
  // 카메라를 끈 채 입장해도 켜기 미리보기에 이모지가 바로 붙도록 모델만 먼저 준비한다.
  useEffect(() => {
    if (supported && cameraStream !== null) {
      visionDetector.preload();
    }
  }, [supported, cameraStream, visionDetector]);

  // 측정 스크립트가 원격 디버깅으로 통계를 읽는다.
  // 운영 빌드로 측정할 때는 VITE_FACE_MASK_STATS=1로 빌드해 연다.
  useEffect(() => {
    const exposed = import.meta.env.DEV || import.meta.env.VITE_FACE_MASK_STATS === "1";
    if (!exposed || compositor == null) {
      return;
    }
    const target = window as unknown as { __faceMaskStats?: () => FaceMaskedStreamStats };
    target.__faceMaskStats = () => compositor.stats();
    return () => {
      delete target.__faceMaskStats;
    };
  }, [compositor]);
  // 디버그 오버레이 한 줄은 개발 빌드에서만 보여 준다.
  const [debugLine, setDebugLine] = useState("");
  useEffect(() => {
    if (!import.meta.env.DEV || compositor == null) {
      return;
    }
    const timer = setInterval(() => {
      const { height, fps, videoMs, stickerMs } = compositor.stats();
      setDebugLine(`mask h${height} ${fps}fps video ${videoMs}ms stk ${stickerMs}ms`);
    }, 1000);
    return () => clearInterval(timer);
  }, [compositor]);

  return {
    supported,
    on,
    setOn(next) {
      trackSocialRoomFaceMaskToggled(next);
      writeFaceMaskOn(next);
      setPreferredOn(next);
    },
    emojiId,
    setEmojiId(next) {
      const id = faceMaskEmojiOf(next).id;
      trackSocialRoomFaceMaskEmojiSelected(id);
      writeFaceMaskEmojiId(id);
      setEmojiIdState(id);
    },
    faceSpot,
    maskedStream: compositor?.stream ?? null,
    sendStream: sendStreamOf(cameraStream, compositor, preferredOn),
    debugLine,
  };
}

/**
 * 가리는 동안 원본 카메라 트랙을 켜 두기
 *
 * 원본으로 보내는 동안 일시정지하면 연결 쪽이 원본 트랙을 꺼 둔다.
 * 그 트랙은 숨은 원본 영상도 함께 써서, 가리기로 돌아오면 합성 재료가 검은 화면이 된다.
 * 가리는 동안 원본은 상대에게 가지 않으므로 다시 켜 둔다.
 * 연결 쪽 효과보다 뒤에 돌아야 하므로 usePeerMesh 다음에 호출한다.
 * 가리는 동안 연결 쪽은 합성 트랙만 건드리므로 원본 트랙이 꺼지는 때는 가리기가 꺼져 있을 때뿐이고, 그래서 두 값이 바뀔 때만 다시 켜면 된다.
 */
export function useKeepMaskSourceLive(cameraStream: MediaStream | null, masking: boolean): void {
  useEffect(() => {
    const track = cameraStream?.getVideoTracks()[0];
    if (masking && track !== undefined) {
      track.enabled = true;
    }
  }, [cameraStream, masking]);
}
