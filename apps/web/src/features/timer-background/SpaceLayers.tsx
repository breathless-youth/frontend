import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { reportHandled } from "@/lib/sentry";

import { imageUrl, loopPosterUrl, loopVideoUrl, spaceScreen } from "./spaceFiles";

const LAYER = "pointer-events-none absolute inset-0 size-full object-cover";

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * 반복 영상 공간
 *
 * 영상을 받지 못하면 포스터를, 포스터도 받지 못하면 부른 쪽에 알려 심플로 그리게 한다.
 * 동작 줄이기 설정이면 처음부터 포스터만 보인다.
 * 파일은 처음 그릴 때의 창 크기로 골라서, 창 크기가 바뀌면 다음에 그릴 때부터 새 파일을 쓴다.
 * 고른 값은 지우지 않고 실패만 Sentry에 남긴다.
 */
export function LoopVideoSpace({
  assetKey,
  onUnavailable,
}: {
  assetKey: string;
  onUnavailable: () => void;
}) {
  const [screen] = useState(() => spaceScreen(viewport()));
  const [stage, setStage] = useState<"video" | "poster">(() =>
    prefersReducedMotion() ? "poster" : "video",
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const poster = loopPosterUrl(assetKey, screen);

  // 숨은 화면에서 영상을 돌리면 전지만 써서 멈췄다가 다시 보이면 잇는다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const follow = () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", follow);
    return () => document.removeEventListener("visibilitychange", follow);
  }, [stage]);

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
  const [screen] = useState(() => spaceScreen(viewport()));
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
