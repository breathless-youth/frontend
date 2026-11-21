import { EyeOff, Maximize, Minimize } from "lucide-react";
import type { Ref, RefObject } from "react";
import { useTranslation } from "react-i18next";

import type { CameraFacing } from "@/features/study-session/adapters/cameraAdapter";
import { CameraPreviewSurface } from "@/features/study-session/components/CameraPreviewSurface";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { cn } from "@/lib/utils";

import { markStudyPanelEvent } from "../home/studyPanelEvents";
import { useStudyPanel, type StudyPanelState } from "../home/useStudyPanel";

const CAMERA_WINDOW_KEY = "focusmakers.pc.cameraWindow";
// 끌기 훅은 오른쪽 위 모서리 기준으로 자리를 들어서, 아래로 끝까지 당겨지는 큰 값으로 오른쪽 아래에서 시작한다.
// ponytail: 아래 여백이 끌기 훅의 안쪽 여백 16px로 정해지고, 다른 값이 필요하면 훅에 아래 기준 자리를 더한다.
const DEFAULT_CAMERA_WINDOW: StudyPanelState = {
  right: 24,
  top: Number.MAX_SAFE_INTEGER,
  minimized: false,
};
// 반투명 검은 바탕이라 밝은 영상 위에서도 아이콘이 보인다.
const CAMERA_BUTTON =
  "flex size-7 items-center justify-center rounded-full bg-dim text-white focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none";

export interface PcCameraWindowProps {
  stream: MediaStream | null;
  facing: CameraFacing;
  videoRef: RefObject<HTMLVideoElement | null>;
  hidden: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onHide: () => void;
  /** 누르거나 포커스가 들어오면 부른다. 겹친 패널보다 위로 올릴 때 쓴다. */
  onActivate: () => void;
  /** 겹친 창 사이의 층 */
  layer: number;
  hideButtonRef?: Ref<HTMLButtonElement>;
}

/**
 * 관리 모드 카메라 작은 창
 *
 * 공부시간 패널과 같은 끌기 훅을 저장 키와 처음 자리만 바꿔 쓴다.
 * 크게 보기와 작게 보기는 버튼으로만 바꿔, 창을 끌려다 잘못 눌러도 화면 전체가 바뀌지 않는다.
 * 크게 보는 동안은 상자 전체를 채우고 끌지 않는다.
 * 숨겨도 영상 요소를 지우지 않고 그 자리에서 투명하게만 둬서 감지와 타임랩스가 계속 프레임을 받는다.
 * 숨긴 창은 누름과 포커스와 화면 낭독기에서 모두 빠져 보이지 않는 창이 클릭을 가로채지 않는다.
 * 영상은 세션 화면과 같은 부품이 그려 녹화 도구 차단 표식과 거울 반전이 그대로 붙는다.
 * 패널처럼 이 창에서 시작한 누름도 공간 플라이아웃을 닫지 않게 표시한다.
 */
export function PcCameraWindow({
  stream,
  facing,
  videoRef,
  hidden,
  expanded,
  onExpandedChange,
  onHide,
  onActivate,
  layer,
  hideButtonRef,
}: PcCameraWindowProps) {
  const { t } = useTranslation("desktop");
  const { ref, right, top, handleProps } = useStudyPanel({
    storageKey: CAMERA_WINDOW_KEY,
    initial: DEFAULT_CAMERA_WINDOW,
  });
  return (
    <div
      ref={ref}
      role="group"
      aria-label={t("session.camera.window")}
      tabIndex={expanded ? undefined : 0}
      inert={hidden}
      aria-hidden={hidden || undefined}
      data-pc-guide="camera"
      onPointerDownCapture={(event) => {
        markStudyPanelEvent(event.nativeEvent);
        onActivate();
      }}
      onFocusCapture={(event) => {
        markStudyPanelEvent(event.nativeEvent);
        onActivate();
      }}
      {...(expanded ? {} : handleProps)}
      style={{
        ...sessionSurfaceStyle,
        ...(expanded ? {} : { right, top }),
        zIndex: layer,
      }}
      className={cn(
        "absolute overflow-hidden select-none focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none",
        expanded
          ? "inset-0"
          : "h-40.5 w-72 cursor-grab touch-none rounded-sm border border-border active:cursor-grabbing",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <CameraPreviewSurface stream={stream} facing={facing} videoRef={videoRef} />
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          ref={hideButtonRef}
          type="button"
          aria-label={t("session.camera.hide")}
          onClick={onHide}
          className={CAMERA_BUTTON}
        >
          <EyeOff aria-hidden="true" className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t(expanded ? "session.camera.shrink" : "session.camera.expand")}
          onClick={() => onExpandedChange(!expanded)}
          className={CAMERA_BUTTON}
        >
          {expanded ? (
            <Minimize aria-hidden="true" className="size-3.5" />
          ) : (
            <Maximize aria-hidden="true" className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
