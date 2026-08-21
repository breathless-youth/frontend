import { useEffect } from "react";
import type { RefObject } from "react";

import { cn } from "@/lib/utils";

import type { CameraFacing } from "../adapters/cameraAdapter";
import { PREVIEW_OBJECT_FIT } from "../previewFit";

/**
 * 카메라 피드 영역 (Figma `Session / Camera Preview BG` 58:109).
 *
 * 카메라가 도는 동안에는 `<video>`가 실제 피드를 그리고, 꺼져 있는 동안에는 Figma 목업과
 * 같은 중립 서피스(사선 밴드 + 라벨)를 그린다 — 권한 거부·기기 점유로 카메라가 없는 상태에서도
 * 화면이 검게 비지 않아야 한다.
 *
 * **스트림은 이 컴포넌트 밖으로 나가지 않는다.** `srcObject`에 붙이는 것 외의 용도로 쓰지 말 것
 * (원본 프레임 저장·전송 금지 — `frontend/CLAUDE.md`).
 *
 * UI가 카메라 SDK를 직접 호출하지 않는 경계는 유지된다 — `getUserMedia`는 어댑터가 부르고
 * 이 컴포넌트는 결과 스트림만 받는다. **MediaPipe도 마찬가지다** — `<video>` ref를 호출부에
 * 넘겨줄 뿐 추론에 대해서는 아무것도 모른다(루트 `CLAUDE.md` 아키텍처 경계).
 *
 * **가로(S3-5)에는 방향 델타가 없다** — 밴드 기하와 라벨 타이포가 세로와 같고, 여기서는 밴드를
 * `repeating-linear-gradient` 하나로 그리므로 어떤 뷰포트에서도 자동으로 채워진다.
 */
export interface CameraPreviewSurfaceProps {
  /** 카메라 어댑터가 실행 중인지 — false면 목업 텍스처를 노출한다. */
  isRunning: boolean;
  /** 어댑터가 연 스트림. `isRunning`이 true여도 렌더 타이밍상 잠깐 null일 수 있다. */
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
   * 심플 모드(S3-4) — **보이지 않지만 계속 돈다.**
   *
   * 언마운트하지 않는 이유는 측정이 표시 방식에 좌우되면 안 되기 때문이다. 언마운트하면
   * `videoRef.current`가 `null`이 되어 추론이 프레임을 못 받고, 신호가 직전 값에 굳은 채
   * 심플 모드 내내 유지된다 — 들어간 순간의 상태가 세션 끝까지 기록되는 조용한 오류다.
   *
   * 숨김에 `display:none`·`visibility:hidden`을 쓰지 않는다. 둘 다 엔진이 비디오 렌더링을
   * 멈출 수 있어 `detectForVideo`가 **정지 화면을 계속 읽는** 더 나쁜 상태가 된다.
   * `opacity: 0`은 합성 단계에서만 지워지므로 디코딩은 그대로 돈다.
   *
   * `data-session-surface="camera"`도 함께 뗀다 — S3-4는 카메라 서피스가 **없는** 화면이고,
   * 화면 스펙과 그 테스트가 이 표식으로 판별한다.
   */
  hidden?: boolean;
  /**
   * 지금이 회전 구간인가 — **빈 자리를 메우려고 살짝 확대한다**(BY-336).
   *
   * 기기를 돌리면 네이티브 뷰 회전과 WebView 리레이아웃이 한 프레임 어긋나면서 이 서피스가
   * 잠깐 뷰포트보다 작게 잡히고, 그동안 가장자리에 어두운 빈 공간이 보인다. 오버스캔이 그
   * 자리를 덮는다 — 회전 구간에만 걸리므로 **정지 상태의 화각은 그대로다.**
   *
   * 처음에는 화면 전체를 블러로 덮어 그 구간을 가렸지만, 덮는 것 자체가 눈에 띈다는 확인으로
   * 걷어냈다(2026-08-01). 가리는 대신 메우는 쪽이 이 화면에서는 덜 튄다.
   */
  rotating?: boolean;
  className?: string;
}

export function CameraPreviewSurface({
  isRunning,
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
      {isRunning ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          // 전면 카메라는 거울처럼 보여야 자연스럽다 — 반대로 **후면은 반전하면 안 된다**
          // (사용자가 보고 있는 실제 장면과 좌우가 뒤집힌다). 추론은 원본 프레임을 쓰므로
          // 이 변환은 표시에만 영향을 준다.
          //
          // 표시 방식은 `previewFit.ts`의 `PREVIEW_OBJECT_FIT` 하나로 정한다 —
          // 진단 오버레이가 같은 값을 읽어 여백/잘림을 계산하므로 여기서만 바꿀 수 없다.
          // **현재 `cover`**(2026-07-30). 아래는 그 판단의 근거다.
          //
          // ## 실측 (2026-07-30 iPhone 17 Pro · Android 에뮬레이터)
          //
          // 카메라 프레임의 긴 축이 **항상 화면의 짧은 축과 만난다**:
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
            "h-full w-full",
            // amp-block·sentry-block: Session Replay 차단 표식(Amplitude·Sentry, BY-407).
            // 전역 설정(blockSelector("video")·blockAllMedia)이 1차 방어지만, 그 설정이
            // 바뀌어도 카메라 요소만은 남도록 요소에도 직접 태깅한다(lib/amplitude.ts·lib/sentry.ts).
            "amp-block sentry-block",
            PREVIEW_OBJECT_FIT === "contain" ? "object-contain object-top" : "object-cover",
            facing === "front" && "scale-x-[-1]",
          )}
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 55px, transparent 55px 110px)",
            }}
          />
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] leading-[14px] tracking-[2px] whitespace-nowrap text-white/16">
            [ 전 면 카 메 라 프 리 뷰 ]
          </p>
        </>
      )}
    </div>
  );
}
