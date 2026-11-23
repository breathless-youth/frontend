import { type SyntheticEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { reportHandled } from "@/lib/sentry";
import { cn } from "@/lib/utils";

import {
  distractImageUrl,
  distractPosterUrl,
  distractVideoUrl,
  imageUrl,
  loopPosterUrl,
  loopVideoUrl,
  spaceScreen,
} from "./spaceFiles";

const LAYER = "pointer-events-none absolute inset-0 size-full object-cover";

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function subscribeViewport(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

/**
 * 지금 화면에 맞는 공간 파일 이름
 *
 * 돌리거나 창 크기를 바꿔 맞는 파일이 달라질 때만 다시 그린다.
 * 같은 방향 안에서 크기만 조금 바뀌면 이름이 같아 영상을 다시 받지 않는다.
 */
function useSpaceScreen() {
  return useSyncExternalStore(subscribeViewport, () => spaceScreen(viewport()));
}

/**
 * 돌려서 파일이 바뀌어도 재생 위치를 잇는 영상 처리기
 *
 * 파일을 바꾸면 처음부터 다시 받아서, 마지막으로 본 위치를 기억했다가 이어 튼다.
 */
function useLoopPosition() {
  const positionRef = useRef(0);
  return {
    onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => {
      // 메타데이터를 읽기 전 0으로 오는 기록은 이어 틀 위치가 아니다.
      if (event.currentTarget.readyState >= HTMLMediaElement.HAVE_METADATA) {
        positionRef.current = event.currentTarget.currentTime;
      }
    },
    onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      if (positionRef.current > 0 && video.duration > 0) {
        video.currentTime = positionRef.current % video.duration;
      }
    },
  };
}

/**
 * 반복 영상 공간
 *
 * 영상을 받지 못하면 포스터를, 포스터도 받지 못하면 부른 쪽에 알려 심플로 그리게 한다.
 * 동작 줄이기 설정이면 처음부터 포스터만 보인다.
 * 돌려서 맞는 파일이 바뀌면 그 파일로 바꾸고, 바뀌기 전 재생 위치를 이어 간다.
 * 고른 값은 지우지 않고 실패만 Sentry에 남긴다.
 */
export function LoopVideoSpace({
  assetKey,
  onUnavailable,
  onReady,
}: {
  assetKey: string;
  onUnavailable: () => void;
  onReady?: () => void;
}) {
  const screen = useSpaceScreen();
  const position = useLoopPosition();
  const [stage, setStage] = useState<"video" | "poster">(() =>
    prefersReducedMotion() ? "poster" : "video",
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const poster = loopPosterUrl(assetKey, screen);

  // video의 poster는 load 이벤트가 없어서 별도로 로드를 확인한다.
  useEffect(() => {
    if (stage !== "video" || !onReady) return;
    const image = new Image();
    image.onload = onReady;
    image.src = poster;
    return () => {
      image.onload = null;
    };
  }, [onReady, poster, stage]);

  // 숨은 화면에서 영상을 돌리면 전지만 써서 멈췄다가 다시 보이면 잇는다.
  // 화면 파일이 바뀌면 영상 요소도 새로 생겨서 새 요소에 다시 걸고, 떼어 낸 앞 요소는 멈춘다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const follow = () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => undefined);
    };
    // 개발 모드의 StrictMode는 정리(멈춤) 뒤 다시 설정해서, 걸 때 지금 상태에 맞춰 둔다.
    follow();
    document.addEventListener("visibilitychange", follow);
    return () => {
      document.removeEventListener("visibilitychange", follow);
      video.pause();
    };
  }, [stage, screen]);

  if (stage === "poster") {
    return (
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={LAYER}
        onError={() => {
          reportHandled(new Error(`space poster failed: ${assetKey}`), "space-file");
          onUnavailable();
        }}
      />
    );
  }
  return (
    <video
      // 같은 요소에서 주소만 바꾸면 위치가 0으로 돌아가는 사이의 기록이 섞여서 파일마다 새 요소를 만든다.
      key={screen}
      ref={videoRef}
      src={loopVideoUrl(assetKey, screen)}
      poster={poster}
      aria-hidden="true"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      className={LAYER}
      {...position}
      onLoadedData={onReady}
      onError={() => {
        reportHandled(new Error(`space video failed: ${assetKey}`), "space-file");
        setStage("poster");
      }}
    />
  );
}

/**
 * 그림 공간
 *
 * 그림을 받지 못하면 부른 쪽에 알려 심플로 그리게 한다.
 */
export function ImageSpace({
  assetKey,
  onUnavailable,
}: {
  assetKey: string;
  onUnavailable: () => void;
}) {
  const screen = useSpaceScreen();
  return (
    <img
      src={imageUrl(assetKey, screen)}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={LAYER}
      onError={() => {
        reportHandled(new Error(`space image failed: ${assetKey}`), "space-file");
        onUnavailable();
      }}
    />
  );
}

/**
 * 비집중 장면이 겹쳐 바뀌는 시간
 * 클래스 duration-600과 같아야 한다.
 */
const DISTRACT_FADE_MS = 600;

/**
 * 비집중 장면
 *
 * 집중 장면 위에 겹쳐 두고 `present`일 때만 드러낸다.
 * 딴짓이 시작될 때 그려서 바뀌기 전에 파일을 받아 두고, 영상은 바뀌기 전까지 멈춰 둔다.
 * 영상을 아직 재생할 수 없으면 영상 요소의 poster가 비집중 포스터를 먼저 보인다.
 * 동작 줄이기 설정이면 포스터나 그림만 쓰고 겹치는 전환 없이 바로 바꾼다.
 * 파일을 받지 못하면 Sentry에 남기고 그리지 않아 집중 장면이 그대로 보인다.
 */
export function DistractSpace({
  assetKey,
  visual,
  present,
}: {
  assetKey: string;
  visual: "video" | "image";
  present: boolean;
}) {
  const screen = useSpaceScreen();
  const [reduced] = useState(prefersReducedMotion);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const position = useLoopPosition();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // 돌려서 떼어 낸 앞 요소나 사라진 층의 영상은 바로 멈춘다.
    const pauseDetached = () => {
      if (!video.isConnected) video.pause();
    };
    if (!present) {
      // 감추는 동안에는 움직이다가 다 감춘 뒤에 멈춘다.
      const timer = setTimeout(() => video.pause(), DISTRACT_FADE_MS);
      return () => {
        clearTimeout(timer);
        pauseDetached();
      };
    }
    const follow = () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => undefined);
    };
    follow();
    document.addEventListener("visibilitychange", follow);
    return () => {
      document.removeEventListener("visibilitychange", follow);
      pauseDetached();
    };
  }, [present, screen, failed]);

  if (failed) return null;
  const className = cn(
    LAYER,
    !reduced && "transition-opacity duration-600 ease-out",
    present ? "opacity-100" : "opacity-0",
  );
  const handleError = () => {
    reportHandled(new Error(`space distract file failed: ${assetKey}`), "space-file");
    setFailed(true);
  };

  if (visual === "image" || reduced) {
    return (
      <img
        src={
          visual === "image"
            ? distractImageUrl(assetKey, screen)
            : distractPosterUrl(assetKey, screen)
        }
        alt=""
        aria-hidden="true"
        draggable={false}
        data-testid="distract-space"
        className={className}
        onError={handleError}
      />
    );
  }
  return (
    <video
      // 같은 요소에서 주소만 바꾸면 위치가 0으로 돌아가는 사이의 기록이 섞여서 파일마다 새 요소를 만든다.
      key={screen}
      ref={videoRef}
      src={distractVideoUrl(assetKey, screen)}
      poster={distractPosterUrl(assetKey, screen)}
      aria-hidden="true"
      data-testid="distract-space"
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      className={className}
      {...position}
      onError={handleError}
    />
  );
}
