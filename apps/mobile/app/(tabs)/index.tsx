import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { StudySessionStreakResponse } from "@focuson/types";

import { getStreak } from "../../lib/statsApi";
import { ensureUserRegistered } from "../../lib/userApi";

export default function HomeScreen() {
  // 임시 확인용 — 확정 디자인 화면 나오면 교체 (SCRUM-172)
  const [streak, setStreak] = useState<StudySessionStreakResponse | null>(null);

  useEffect(() => {
    void (async () => {
      const userId = await ensureUserRegistered();
      if (userId == null) return;
      try {
        const result = await getStreak(userId);
        console.log("[streak] 조회 성공:", result);
        setStreak(result);
      } catch (error) {
        console.warn("[streak] 조회 실패", error);
      }
    })();
  }, []);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white">
      <Text className="text-xl font-semibold">FocusOn</Text>
      <Text className="text-sm text-gray-500">AI 비전 기반 순공 시간 측정 캠스터디</Text>
      {streak ? (
        <Text className="text-sm text-orange-500">
          🔥 연속 {streak.streak}일 · 최장 {streak.maxStreak}일
        </Text>
      ) : null}
    </View>
  );
}
