import { statusColors } from "@focuson/design-tokens";
import type { StudyStatus } from "@focuson/study-core";
import { Text, View } from "react-native";

const LABELS: Record<StudyStatus, string> = {
  STUDYING: "공부 중",
  AWAY: "자리 비움",
  PAUSED: "일시정지",
  CAMERA_OFF: "카메라 꺼짐",
};

export function StudyStatusBadge({ status }: { status: StudyStatus }) {
  return (
    <View
      className="flex-row items-center rounded-full px-3 py-1"
      style={{ backgroundColor: statusColors[status] }}
    >
      <Text className="text-xs font-semibold text-white">{LABELS[status]}</Text>
    </View>
  );
}
