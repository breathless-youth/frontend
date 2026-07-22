import { useRef } from "react";
import { useParams } from "react-router-dom";

import { useWebStudySession } from "@/features/study-session/useWebStudySession";
import { useFocusDetector } from "@/features/vision/useFocusDetector";
import { formatDuration } from "@/lib/utils";

/**
 * 스터디룸 화면(싱글/멀티 공용) — 브라우저 독립 구현체이자 MVP의 실제 구현체다. 모바일은
 * `apps/mobile/app/room/[id].tsx`에서 이 라우트를 WebView로 그대로 로드한다(ADR 0001).
 * 네이티브 전환 로드맵은 ADR 0002/0003 참고.
 * WebRTC 연결(LiveKit Web SDK)과 참가자 그리드는 백엔드 토큰 서버가 준비되는 대로 이 화면에서
 * <LiveKitRoom>으로 감싼다. 공부 상태·집중률 계산은 @focuson/study-core를 사용한다(웹에서
 * 재구현하지 않음) — useFocusDetector의 isFocused를 useWebStudySession이 STUDYING/AWAY로
 * 매핑해 총공부시간/순공시간/집중률을 집계한다.
 */
export function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isFocused } = useFocusDetector(videoRef);
  const summary = useWebStudySession(isFocused);
  const focusRatePercent = Math.round(summary.focusRate * 100);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-medium">스터디룸 #{id}</h1>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="border-border aspect-video w-full max-w-md rounded-md border"
      />
      <p className="text-sm">집중 상태: {isFocused ? "집중 중" : "감지 안 됨"}</p>

      <div className="border-border w-full max-w-md rounded-2xl border p-4">
        <p className="text-muted-foreground text-sm">총 공부 시간</p>
        <p className="text-xl font-semibold">{formatDuration(summary.totalStudySeconds)}</p>
        <p className="text-muted-foreground mt-2 text-sm">순공시간</p>
        <p className="text-xl font-semibold">{formatDuration(summary.pureStudySeconds)}</p>
        <p className="text-muted-foreground mt-2 text-sm">집중률</p>
        <p className="text-xl font-semibold">{focusRatePercent}%</p>
      </div>

      <p className="text-muted-foreground max-w-md text-center text-xs">
        카메라 영상은 이 브라우저 안에서만 분석되며 어디에도 전송·저장되지 않습니다. (멀티
        종일룸에서는 참여자 화면 공유를 위해 LiveKit으로 영상이 전송되지만, AI 분석용 원본
        프레임·얼굴 데이터는 서버로 전송되지 않습니다.)
      </p>
    </main>
  );
}
