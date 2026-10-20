import { colors } from "@focusmakers/design-tokens";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconCheckSm, IconChevronLeft } from "../components/icons";
import { notifyPickerClosed } from "../lib/appLock/appLockRelay";
import { appLockNative, type LaunchableApp } from "../modules/app-lock";

/**
 * Android 잠글 앱 고르기
 *
 * 앱 이름과 아이콘은 이 화면 안에서만 쓰고 웹에는 고른 개수만 돌아간다.
 * 완료·뒤로·시스템 뒤로가기가 모두 언마운트를 지나므로 고른 결과는 언마운트에서 한 번만 넘긴다.
 * 손대지 않았으면 undefined, 다 지웠으면 null을 넘겨 iOS 고르기 화면과 같은 규칙으로 저장한다.
 */
export default function AppLockPickerScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [apps, setApps] = useState<LaunchableApp[] | null>(null);
  // null은 저장된 선택을 못 읽었다는 뜻이다.
  // 그 상태로 고르게 두면 닫을 때 빈 선택으로 덮어써 기존 잠금 목록이 사라지므로 목록을 막는다.
  const [selection, setSelection] = useState<string[] | null>(() => {
    try {
      return appLockNative?.getSelectedPackages() ?? [];
    } catch (error) {
      console.warn("[appLock] 저장된 선택 읽기 실패", error);
      return null;
    }
  });
  const selected = selection ?? [];
  const [query, setQuery] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const changedRef = useRef<string[] | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void (appLockNative?.getLaunchableApps() ?? Promise.resolve([])).then(
      (list) => {
        if (active) setApps(list);
      },
      (error: unknown) => {
        console.warn("[appLock] 설치된 앱 목록 읽기 실패", error);
        if (!active) return;
        setApps([]);
        setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const changed = changedRef;
    return () => {
      const packages = changed.current;
      void notifyPickerClosed(
        packages === undefined ? undefined : packages.length > 0 ? JSON.stringify(packages) : null,
      );
    };
  }, []);

  const toggle = (packageName: string) => {
    const next = selected.includes(packageName)
      ? selected.filter((name) => name !== packageName)
      : [...selected, packageName];
    changedRef.current = next;
    setSelection(next);
  };

  const keyword = query.trim().toLowerCase();
  const failed = loadFailed || selection === null;
  const visible = failed
    ? []
    : (apps ?? []).filter((app) => app.label.toLowerCase().includes(keyword));

  return (
    <View className="bg-bg-layer1 dark:bg-bg-layer1-dark flex-1">
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <View className="h-14 flex-row items-center px-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <IconChevronLeft size={14} />
          </Pressable>
          <Text
            accessibilityRole="header"
            className="text-text-primary dark:text-text-primary-dark flex-1 text-[18px] font-sans-bold"
          >
            잠긴 앱
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            className="min-h-11 min-w-11 items-center justify-center px-3"
          >
            <Text className="text-brand-primary dark:text-brand-primary-dark text-[16px] font-sans-bold">
              완료
            </Text>
          </Pressable>
        </View>

        <View className="px-5">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="앱 이름 검색"
            placeholderTextColor={colors.text.tertiary[scheme]}
            className="bg-bg-base dark:bg-bg-base-dark text-text-primary dark:text-text-primary-dark h-12 rounded-md px-4 font-sans text-[15px]"
          />
          <Text className="text-text-secondary dark:text-text-secondary-dark mb-2 mt-4 font-sans text-[13px]">
            {selected.length}개 선택
          </Text>
        </View>

        {apps === null ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(app) => app.packageName}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            ListEmptyComponent={
              <Text className="text-text-secondary dark:text-text-secondary-dark mt-10 text-center font-sans text-[15px]">
                {failed ? "앱 목록을 불러오지 못했어요" : "찾는 앱이 없어요"}
              </Text>
            }
            renderItem={({ item }) => {
              const checked = selected.includes(item.packageName);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.label}
                  accessibilityState={{ checked }}
                  onPress={() => toggle(item.packageName)}
                  className="bg-bg-base dark:bg-bg-base-dark border-border-default dark:border-border-default-dark min-h-14 flex-row items-center border-b px-4"
                >
                  <Image
                    source={{ uri: `data:image/png;base64,${item.iconBase64}` }}
                    className="size-9 rounded-sm"
                  />
                  <Text
                    numberOfLines={1}
                    className="text-text-primary dark:text-text-primary-dark ml-3 flex-1 font-sans text-[15px]"
                  >
                    {item.label}
                  </Text>
                  <View
                    className={
                      checked
                        ? "bg-brand-primary dark:bg-brand-primary-dark size-6 items-center justify-center rounded-full"
                        : "border-border-strong dark:border-border-strong-dark size-6 rounded-full border-2"
                    }
                  >
                    {checked && <IconCheckSm size={13} />}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
