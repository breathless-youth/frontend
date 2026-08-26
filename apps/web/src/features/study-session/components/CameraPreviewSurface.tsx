import { useEffect } from "react";
import type { RefObject } from "react";

import { startVideoPlayback, VIDEO_PLAYBACK_KICK_PROPS } from "@/lib/startVideoPlayback";
import { cn } from "@/lib/utils";

import type { CameraFacing } from "../adapters/cameraAdapter";
import { PREVIEW_OBJECT_FIT } from "../previewFit";

/**
 * 카메라 피드 영역
 *
 * `<video>`는 항상 마운트되어 있고, 스트림이 붙기 전에는 배경색(`--session-camera-base`)만 보인다
 *
 * 스트림은 `srcObject`에 붙이는 것 외의 용도로 쓰지 말 것 (원본 프레임 저장·전송 금지).
 *
 * UI가 카메라 SDK를 직접 호출하지 않는 경계는 유지된다 — `getUserMedia`는 어댑터가 부르고
 * 이 컴포넌트는 결과 스트림만 받는다. MediaPipe도 마찬가지다 — `<video>` ref를 호출부에
 * 넘겨줄 뿐 추론에 대해서는 아무것도 모른다.
 */
export interface CameraPreviewSurfaceProps {
  /** 어댑터가 연 스트림 */
  stream: MediaStream | null;
  /** 지금 열려 있는 카메라 방향 — 좌우 반전 여부가 여기서 갈린다. */
  facing: CameraFacing;
  /**
   * 프리뷰 `<video>` 참조 — **호출부가 소유한다.**
   *
   * 여기서 `useRef`로 들고 있으면 추론이 그 엘리먼트에 닿을 방법이 없어, 감지용으로 숨은
   * `<video>`를 하나 더 만들거나 canvas로 프레임을 복사해야 한다. 둘 다 디코드 경로를 늘린다
   * (설계 §3: `detectForVideo`가 비디오를 그대로 먹어 프레임 복사가 한 번 준다).
   *
   * ⚠️ 이 컴포넌트가 언마운트되면 `ref.current`는 `null`이 된다. 참조를 받는 쪽은 그 구간을
   * "프레임 없음"으로 다뤄야 한다.
   */
  videoRef: RefObject<HTMLVideoElement | null>;
  /**
   * 심플 모드
   *
   * 언마운트하지 않는 이유는 측정이 표시 방식에 좌우되면 안 되기 때문이다. 언마운트하면
   * `videoRef.current`가 `null`이 되어 추론이 프레임을 못 받고, 신호가 직전 값에 굳은 채
   * 심플 모드 내내 유지된다 — 들어간 순간의 상태가 세션 끝까지 기록되는 조용한 오류다.
   *
   * 숨김에 `display:none`·`visibility:hidden`을 쓰지 않는다. 둘 다 엔진이 비디오 렌더링을
   * 멈출 수 있어 `detectForVideo`가 정지 화면을 계속 읽는 더 나쁜 상태가 된다.
   * `opacity: 0`은 합성 단계에서만 지워지므로 디코딩은 그대로 돈다.
   *
   * `data-session-surface="camera"`도 함께 뗀다 — 화면 스펙과 그 테스트가 이 표식으로 판별한다.
   */
  hidden?: boolean;
  /**
   * 지금이 회전 구간인가 — 빈 자리를 메우려고 살짝 확대한다
   *
   * 기기를 돌리면 네이티브 뷰 회전과 WebView 리레이아웃이 한 프레임 어긋나면서 이 서피스가
   * 잠깐 뷰포트보다 작게 잡히고, 그동안 가장자리에 어두운 빈 공간이 보인다. 오버스캔이 그
   * 자리를 덮는다 — 회전 구간에만 걸리므로 정지 상태의 화각은 그대로다.
   */
  rotating?: boolean;
  className?: string;
}

export function CameraPreviewSurface({
  stream,
  facing,
  videoRef,
  hidden = false,
  rotating = false,
  className,
}: CameraPreviewSurfaceProps) {
  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    video.srcObject = stream;
    if (stream !== null) {
      startVideoPlayback(video);
    }
    return () => {
      // 언마운트 시 참조를 끊는다 — 트랙 정지는 어댑터의 책임이다.
      video.srcObject = null;
    };
  }, [stream, videoRef]);

  return (
    <div
      aria-hidden="true"
      {...(hidden ? {} : { "data-session-surface": "camera" })}
      className={cn(
        // 300ms 페이드는 모드 전환의 타이머 이동과 같은 박자다 — 배경만 0ms에 스왑되면 전환이
        // 이질적으로 보인다(BY-336). SimpleModeSurface와 쌍.
        "absolute inset-0 overflow-hidden bg-[var(--session-camera-base)]",
        "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        // 심플 모드: 합성에서만 지운다(위 `hidden` 주석). 아래 SimpleModeSurface가 그대로 보이고,
        // 탭은 이 레이어를 통과해야 심플 모드 토글이 계속 동작한다.
        hidden && "pointer-events-none opacity-0",
        // 회전 오버스캔(위 `rotating` 주석). 8%면 회전 중 생기는 빈 자리를 덮으면서도
        // 되돌아올 때 배율 변화가 눈에 띄지 않는다 — 더 키우면 확대됐다 줄어드는 게 보인다.
        rotating && "scale-[1.08]",
        className,
      )}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        {...VIDEO_PLAYBACK_KICK_PROPS}
        // 전면 카메라는 거울처럼 보여야 자연스럽다 — 반대로 후면은 반전하면 안 된다
        // (사용자가 보고 있는 실제 장면과 좌우가 뒤집힌다). 추론은 원본 프레임을 쓰므로
        // 이 변환은 표시에만 영향을 준다.
        //
        // 표시 방식은 `previewFit.ts`의 `PREVIEW_OBJECT_FIT` 하나로 정한다 —
        // 진단 오버레이가 같은 값을 읽어 여백/잘림을 계산하므로 여기서만 바꿀 수 없다.
        //
        // 카메라 프레임의 긴 축이 항상 화면의 짧은 축과 만난다:
        //
        // | 기기 방향 | 뷰포트          | 스트림           | 어긋남 |
        // | --------- | --------------- | ---------------- | ------ |
        // | 세로      | 402×874 (0.46)  | 1280×720 (1.78)  | 74%    |
        // | 가로      | 874×402 (2.17)  | 720×1280 (0.56)  | 74%    |
        //
        // 회전으로는 못 고친다 — **두 방향 모두 내용은 이미 똑바로 서 있다.** 카메라가 방향
        // 처리를 올바르게 하고 있어서, 여기서 90° 돌리면 오히려 눕는다.
        //
        // ## 세 선택지와 각각의 대가
        //
        // | 방식      | 화면          | 원본 화각        | 배율   |
        // | --------- | ------------- | ---------------- | ------ |
        // | `cover`   | 꽉 참         | 32%만 보임       | 0.99   |
        // | `contain` | 68~74% 남음   | 100% 보임        | 0.31   |
        // | `fill`    | 꽉 참         | 100% 보임        | 왜곡   |
        //
        // **`cover`를 골랐다.** `contain`은 프레임 전체를 보여주지만 영상이 화면의 1/3로
        // 줄어 실기기에서 확인 후 되돌렸고(2026-07-30), `fill`은 얼굴 비율이 3.9배 늘어나
        // 논외다.
        //
        // ⚠️ **`cover`의 대가는 "확대돼 보인다"는 인상이다.** 배율은 0.99로 등배인데 원본
        // 가로 화각의 32%만 화면에 들어와서, 전체를 보다가 가운데 1/3만 보는 셈이라 3배
        // 당긴 것처럼 느껴진다. 확대가 아니라 잘라낸 결과다 — **줌아웃으로는 못 고친다.**
        // 줌아웃은 곧 `contain`이고, 그러면 영상이 작아진다. 화면을 채우면서 화각을 다
        // 보여주는 방법은 프레임 비율이 화면과 같아지지 않는 한 존재하지 않는다.
        //
        // 남는 조정 여지는 **중간값**이다 — 프리뷰 영역을 화면보다 낮게 잡으면 잘림이 74%와
        // 0% 사이 어디로든 간다(예: 높이 60%면 잘림 47%, 남는 40%는 UI 자리).
        //
        // ⚠️ 또 하나의 대가: **모델이 보는 화각이 사용자가 보는 화각보다 넓다.** 화면 밖
        // 물체가 `cell phone`으로 잡힐 수 있고 사용자는 이유를 알 수 없다. `contain`이면
        // 해소되는 문제라 맞바꿈 관계다.
        //
        // 비율 계산은 CSS가 컨테이너 기준으로 하므로 세로·가로가 자동으로 함께 처리된다.
        className={cn(
          // 탭이 video에 직접 닿으면 iOS가 네이티브 재생/일시정지 컨트롤을 띄운다 —
          // 이 영상은 조작 대상이 아니므로 탭을 아래 레이어로 통과시킨다.
          "pointer-events-none h-full w-full",
          // amp-block은 Amplitude, sentry-block은 Sentry의 Session Replay 차단 표식이다.
          // 전역 설정인 blockSelector("video")와 blockAllMedia가 1차 방어지만, 그 설정이
          // 바뀌어도 카메라 요소만은 남도록 요소에도 직접 태깅한다. lib/amplitude.ts와
          // lib/sentry.ts 참고.
          "amp-block sentry-block",
          PREVIEW_OBJECT_FIT === "contain" ? "object-contain object-top" : "object-cover",
          facing === "front" && "scale-x-[-1]",
        )}
      />
    </div>
  );
}
