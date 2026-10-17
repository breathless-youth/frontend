import { useEffect, useState } from "react";

import {
  trackAppLockAppsSelected,
  trackAppLockPermissionResult,
  trackAppLockToggled,
} from "@/lib/amplitude";
import { showToast } from "@/lib/toast";

import { readAppLockEnabled, writeAppLockEnabled } from "./appLockSettings";
import {
  type AppLockState,
  authorizeAppLock,
  pickAppLockApps,
  queryAppLock,
} from "./nativeAppLock";

/**
 * 방해 앱 잠금 설정 화면 상태
 *
 * 켜짐은 웹이, 권한과 고른 앱은 네이티브가 갖는다.
 * 응답이 오지 않으면 실패를 따로 알리지 않고 스위치를 꺼 둔 채로 둔다.
 */
export function useAppLockSettings() {
  const [enabled, setEnabled] = useState(readAppLockEnabled);
  const [counts, setCounts] = useState({ appCount: 0, categoryCount: 0 });
  // 처음 상태를 받기 전에는 지원 여부와 고른 앱을 몰라서 조작을 막아 둔다.
  const [busy, setBusy] = useState(true);

  const applyCounts = (state: AppLockState) => {
    setCounts({ appCount: state.appCount, categoryCount: state.categoryCount });
  };

  useEffect(() => {
    let active = true;
    void queryAppLock().then((state) => {
      if (!active) return;
      setBusy(false);
      if (state !== null) applyCounts(state);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (next: boolean) => {
    if (!next) {
      writeAppLockEnabled(false);
      setEnabled(false);
      trackAppLockToggled({ on: false, source: "settings" });
      return;
    }
    setBusy(true);
    const state = await authorizeAppLock();
    setBusy(false);
    if (state === null) return;
    applyCounts(state);
    if (!state.supported) {
      showToast("방해 앱 잠금은 iOS 18 이상에서 쓸 수 있어요");
      return;
    }
    trackAppLockPermissionResult({ granted: state.authorized });
    if (state.authorized) {
      writeAppLockEnabled(true);
      setEnabled(true);
      trackAppLockToggled({ on: true, source: "settings" });
    }
  };

  const pick = async () => {
    setBusy(true);
    const state = await pickAppLockApps();
    setBusy(false);
    if (state === null) return;
    applyCounts(state);
    trackAppLockAppsSelected({ appCount: state.appCount, categoryCount: state.categoryCount });
  };

  return { enabled, ...counts, busy, toggle, pick };
}
