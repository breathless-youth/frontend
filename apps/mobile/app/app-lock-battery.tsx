import { router } from "expo-router";
import { Platform, Text, View } from "react-native";

import { AppLockSheet } from "../components/AppLockSheet";
import { batteryGuideKind } from "../lib/appLock/androidFlow";
import { t, type CopyKey } from "../lib/i18n";
import { appLockNative } from "../modules/app-lock";

// 설정 열기가 이 앱의 앱 정보 화면을 열어서 그 화면부터의 순서다.
// 영어 기기는 제조사마다 메뉴 이름이 달라서 한국어가 같아도 키를 나눈다.
const STEPS: Record<"samsung" | "xiaomi" | "other", CopyKey[]> = {
  samsung: ["appLockBattery.stepBattery", "appLockBattery.stepUnrestricted"],
  xiaomi: [
    "appLockBattery.stepBatterySaver",
    "appLockBattery.stepNoRestrictions",
    "appLockBattery.stepAutostart",
  ],
  other: ["appLockBattery.stepBatteryUsage", "appLockBattery.stepUnrestricted"],
};

/**
 * 제조사 배터리 예외 안내
 *
 * 삼성·샤오미는 배터리를 아끼려고 뒤에 있는 앱을 멈춰서, 잠금 서비스가 같이 멈추면 공부 중에 잠금이 풀린다.
 * 예외를 직접 요청하는 권한은 Play 정책상 쓰지 않고 이 앱의 앱 정보 화면만 열어 준다.
 * 설정에서 다시 열면 다른 제조사도 오는데, 기본 Android의 앱 배터리 사용량 메뉴 순서를 보여 준다.
 */
export default function AppLockBatteryScreen() {
  const { Manufacturer = "", Brand = "" } = Platform.constants as {
    Manufacturer?: string;
    Brand?: string;
  };
  const kind = batteryGuideKind(Manufacturer, Brand);

  return (
    <AppLockSheet
      title={t("appLockBattery.title")}
      primary={{
        label: t("common.openSettings"),
        onPress: () => {
          appLockNative?.openAppBatterySettings();
          router.back();
        },
      }}
    >
      <Text className="text-text-secondary dark:text-text-secondary-dark -mt-2 mb-4 font-sans text-[13px] leading-[19px]">
        {t("appLockBattery.body")}
      </Text>
      <View className="bg-bg-layer2 dark:bg-bg-layer2-dark rounded-md px-4 py-2">
        {STEPS[kind ?? "other"].map((step, index) => (
          <View key={step} className="flex-row items-center py-1.5">
            <Text className="text-brand-primary dark:text-brand-primary-dark w-6 font-sans-bold text-[12px]">
              {index + 1}
            </Text>
            <Text className="text-text-primary dark:text-text-primary-dark font-sans text-[14px]">
              {t(step)}
            </Text>
          </View>
        ))}
      </View>
    </AppLockSheet>
  );
}
