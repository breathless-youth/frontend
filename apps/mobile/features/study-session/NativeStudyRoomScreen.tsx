import type { StudyMode } from "@focuson/types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { StudyStatusBadge } from "../../components/ui/StudyStatusBadge";
import { formatDuration } from "../../lib/formatDuration";
import { CameraPreview, useCameraPermission, type CameraType } from "../../platform/camera";
import { createMockRoomMediaController, createMockRoomTokenIssuer } from "../../platform/rtc";
import { createMockVisionEngine } from "../../platform/vision";
import { useStudySession } from "./useStudySession";

interface NativeStudyRoomScreenProps {
  id: string;
  mode: StudyMode;
}

/**
 * 네이티브 스터디룸 화면 — 현재는 **비활성(dormant)** 상태다. `app/room/[id].tsx`는 MVP 동안
 * WebView 구현을 쓰므로 이 컴포넌트는 어떤 라우트에서도 렌더링되지 않는다. 카메라 미리보기 +
 * 온디바이스 Vision(mock) + 세션 집계 배선을 그대로 보존해 네이티브 전환 시 재사용한다.
 * `useLocalSearchParams` 대신 props로 id/mode를 받도록 바꿔서 라우트 컨텍스트 없이도 렌더링/
 * 테스트할 수 있게 했다. 배경: docs/adr/0003-phased-rollout-webview-mvp-then-native.md
 */
export function NativeStudyRoomScreen({ id, mode }: NativeStudyRoomScreenProps) {
  const { granted, requestPermission } = useCameraPermission();
  const engine = useMemo(() => createMockVisionEngine(), []);
  const session = useStudySession(engine);

  const [facing, setFacing] = useState<CameraType>("front");
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // 멀티 종일룸: LiveKit 영상 송출 경로(Vision 분석 경로와 독립). 현재 mock 연결.
  useEffect(() => {
    if (mode !== "multi") return;
    const controller = createMockRoomMediaController();
    const issuer = createMockRoomTokenIssuer();
    let disposed = false;
    void issuer.issueToken({ roomId: id, identity: "me" }).then((connectInput) => {
      if (!disposed) return controller.connect(connectInput);
    });
    return () => {
      disposed = true;
      void controller.disconnect();
    };
  }, [mode, id]);

  const toggleCamera = () => {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    session.setCameraEnabled(next);
  };

  const switchCamera = () => {
    setFacing((prev) => (prev === "front" ? "back" : "front"));
  };

  if (!granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white p-6">
        <Text className="text-center text-base">집중도 측정을 위해 카메라 권한이 필요합니다.</Text>
        <Pressable
          className="rounded-full bg-black px-6 py-3"
          onPress={() => void requestPermission()}
        >
          <Text className="text-white">카메라 권한 허용</Text>
        </Pressable>
      </View>
    );
  }

  const focusRatePercent = Math.round(session.summary.focusRate * 100);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ gap: 16, padding: 16 }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-semibold">
          {mode === "multi" ? "멀티 종일룸" : "싱글 스터디룸"} #{id}
        </Text>
        <StudyStatusBadge status={session.status} />
      </View>

      <CameraPreview
        facing={facing}
        enabled={cameraEnabled}
        style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 16 }}
      />

      <View className="rounded-2xl bg-gray-50 p-4">
        <Text className="text-sm text-gray-500">총 공부 시간</Text>
        <Text className="text-xl font-semibold">
          {formatDuration(session.summary.totalStudySeconds)}
        </Text>
        <Text className="mt-2 text-sm text-gray-500">순공시간</Text>
        <Text className="text-xl font-semibold">
          {formatDuration(session.summary.pureStudySeconds)}
        </Text>
        <Text className="mt-2 text-sm text-gray-500">집중률</Text>
        <Text className="text-xl font-semibold">{focusRatePercent}%</Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Pressable className="rounded-full bg-gray-200 px-4 py-2" onPress={switchCamera}>
          <Text>전/후면 전환</Text>
        </Pressable>
        <Pressable className="rounded-full bg-gray-200 px-4 py-2" onPress={toggleCamera}>
          <Text>{cameraEnabled ? "카메라 끄기" : "카메라 켜기"}</Text>
        </Pressable>
        {session.status === "PAUSED" ? (
          <Pressable className="rounded-full bg-gray-200 px-4 py-2" onPress={session.resume}>
            <Text>재개</Text>
          </Pressable>
        ) : (
          <Pressable className="rounded-full bg-gray-200 px-4 py-2" onPress={session.pause}>
            <Text>일시정지</Text>
          </Pressable>
        )}
        <Pressable
          className="rounded-full bg-red-600 px-4 py-2"
          onPress={session.end}
          disabled={session.isEnded}
        >
          <Text className="text-white">종료</Text>
        </Pressable>
        {mode === "multi" ? (
          <Pressable className="rounded-full border border-gray-300 px-4 py-2">
            <Text>참여자 신고</Text>
          </Pressable>
        ) : null}
      </View>

      <Text className="text-xs text-gray-400">
        {mode === "multi"
          ? "카메라 영상은 참여자 화면 공유를 위해 전송됩니다(녹화·저장 안 함). AI 분석용 원본 프레임·얼굴 데이터는 서버로 전송되지 않습니다."
          : "카메라 영상은 이 기기 안에서만 분석되며 어디에도 전송·저장되지 않습니다."}
      </Text>
    </ScrollView>
  );
}
