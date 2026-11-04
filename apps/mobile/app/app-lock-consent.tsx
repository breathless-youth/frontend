import { router } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";

import { AppLockSheet } from "../components/AppLockSheet";
import { IconCheckSm } from "../components/icons";
import { consentAction, notifyConsentClosed } from "../lib/appLock/androidFlow";
import { t } from "../lib/i18n";
import { appLockNative } from "../modules/app-lock";

function readGrants() {
  try {
    return {
      usage: appLockNative?.hasUsageAccess() ?? false,
      overlay: appLockNative?.canDrawOverlays() ?? false,
    };
  } catch (error) {
    console.warn("[appLock] 권한 상태 읽기 실패", error);
    return { usage: false, overlay: false };
  }
}

/**
 * Android 방해 앱 잠금 권한 안내
 *
 * 두 권한 모두 설정 화면에서 켜야 해서 앱으로 돌아올 때마다 다시 읽는다.
 * 둘 다 켜졌으면 닫고, 하나가 남았으면 남은 권한을 여는 버튼으로 바꾼다.
 * 쓸어 닫기·배경 누르기·뒤로가기가 모두 언마운트를 지나므로 닫힘 알림은 언마운트에서 한 번만 보낸다.
 */
export default function AppLockConsentScreen() {
  const [grants, setGrants] = useState(readGrants);
  const action = consentAction(grants.usage, grants.overlay);

  useEffect(() => notifyConsentClosed, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const next = readGrants();
      setGrants(next);
      if (next.usage && next.overlay) router.back();
    });
    return () => subscription.remove();
  }, []);

  const open = () => {
    if (action?.open === "usage") appLockNative?.openUsageAccessSettings();
    else if (action?.open === "overlay") appLockNative?.openOverlaySettings();
    else router.back();
  };

  return (
    <AppLockSheet
      title={t("appLockConsent.title")}
      primary={{ label: action?.label ?? t("common.done"), onPress: open }}
    >
      <PermissionItem
        step={1}
        done={grants.usage}
        title={t("appLockConsent.usageTitle")}
        body={t("appLockConsent.usageBody")}
      />
      <PermissionItem
        step={2}
        done={grants.overlay}
        title={t("appLockConsent.overlayTitle")}
        body={t("appLockConsent.overlayBody")}
      />
      {/* Play 사용자 데이터 정책상 설치된 앱 목록은 권한 요청 전에 앱 안에서 알려야 한다. */}
      <Text className="text-text-secondary dark:text-text-secondary-dark mt-2 font-sans text-[13px] leading-[19px]">
        {t("appLockConsent.installedApps")}
      </Text>
    </AppLockSheet>
  );
}

function PermissionItem({
  step,
  done,
  title,
  body,
}: {
  step: number;
  done: boolean;
  title: string;
  body: string;
}) {
  return (
    <View className="bg-bg-layer2 dark:bg-bg-layer2-dark mb-2 flex-row rounded-md p-4">
      <View
        className={
          done
            ? "bg-brand-primary dark:bg-brand-primary-dark size-6 items-center justify-center rounded-full"
            : "bg-brand-subtle dark:bg-brand-subtle-dark size-6 items-center justify-center rounded-full"
        }
      >
        {done ? (
          <IconCheckSm size={13} />
        ) : (
          <Text className="text-brand-primary dark:text-brand-primary-dark font-sans-bold text-[12px]">
            {step}
          </Text>
        )}
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center">
          <Text className="text-text-primary dark:text-text-primary-dark font-sans-bold text-[15px]">
            {title}
          </Text>
          {done && (
            <Text className="text-feedback-success dark:text-feedback-success-dark ml-1.5 font-sans text-[12px]">
              {t("appLockConsent.granted")}
            </Text>
          )}
        </View>
        <Text className="text-text-secondary dark:text-text-secondary-dark mt-1 font-sans text-[13px] leading-[19px]">
          {body}
        </Text>
      </View>
    </View>
  );
}
