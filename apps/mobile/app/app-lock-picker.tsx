import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SELECTION_ID } from "../lib/appLock/appLock";
import { notifyPickerClosed } from "../lib/appLock/appLockRelay";
import { getRnda } from "../lib/appLock/rnda";

/**
 * 잠글 앱 고르기
 *
 * 앱 목록은 iOS 스크린타임 선택 화면이라 웹뷰로 그릴 수 없어 네이티브 모달로 연다.
 * 완료 버튼과 아래로 쓸어 닫기가 모두 언마운트를 지나므로 고른 결과는 언마운트에서 한 번만 넘긴다.
 * 선택 문자열은 앱 토큰이라 로그에 남기지 않는다.
 * 시트 모달 안에서는 훅이 주는 화면 전체 안전 영역이 시트 위치와 맞지 않아서, 뷰가 놓인 자리로 재는 SafeAreaView를 쓴다.
 */
export default function AppLockPickerScreen() {
  const rnda = getRnda();
  // 손대지 않으면 undefined로 남아 저장된 선택을 그대로 두고, 전부 지우면 선택 화면이 null을 보낸다.
  const selectionRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const selection = selectionRef;
    return () => {
      void notifyPickerClosed(selection.current);
    };
  }, []);

  return (
    <View className="bg-bg-base dark:bg-bg-base-dark flex-1">
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <View className="flex-row justify-end px-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            className="min-h-11 min-w-11 items-center justify-center px-3"
          >
            <Text className="text-text-primary dark:text-text-primary-dark text-[16px] font-sans-bold">
              완료
            </Text>
          </Pressable>
        </View>
        {rnda !== null && (
          <rnda.DeviceActivitySelectionView
            style={{ flex: 1 }}
            familyActivitySelection={rnda.getFamilyActivitySelectionId(SELECTION_ID) ?? null}
            onSelectionChange={(event) => {
              selectionRef.current = event.nativeEvent.familyActivitySelection;
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
