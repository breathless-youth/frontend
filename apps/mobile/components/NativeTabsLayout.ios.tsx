import { softBlue } from "@focusmakers/design-tokens";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DynamicColorIOS, Platform, useColorScheme } from "react-native";

import { HomeDateBar } from "./HomeDateBar";
import { getActiveTab, setActiveTabRoute, TAB_BY_ROUTE_NAME } from "../lib/activeTab";
import { pressHomePlay, rendersNativeHomeChrome, useHomeDateBar } from "../lib/homeDateBar";
import { trackNativeEvent } from "../lib/nativeAnalytics";
import { subscribeSettingsReveal, takeInitialActiveRoute } from "../lib/settingsReveal";
import { getStartKey, subscribeStartKey } from "../lib/startTab";
import { useTabBarState } from "../lib/tabBarVisibility";

/**
 * iOS 시스템 탭 바
 *
 * iOS 26은 Liquid Glass로, iOS 18 이하는 기본 탭 바로 시스템이 그린다.
 * 아이콘은 Android 커스텀 바와 같은 패스를 검정 템플릿 PNG로 구운 것이라 색은 시스템 tint가 입힌다.
 * 활성 아이콘은 같은 패스의 안쪽을 채운 것이라 모양은 그대로고 색만 반전돼 보인다.
 * 탭 5개는 조건 없이 항상 렌더한다.
 * 실행 중 트리거를 넣고 빼면 네비게이터가 다시 마운트돼 상태를 잃는다.
 * iOS 26부터는 홈에서만 설정 자리에 떨어진 재생 버튼을 보이고, 탭 바 아래 액세서리에 홈 날짜 줄을 그린다.
 * 탭 6개를 늘 두면 iOS가 다섯 번째부터 `더 보기`로 접으므로 설정과 재생을 `hidden`으로 바꿔 끼운다.
 */
const TABS = [
  {
    name: "index",
    label: "홈",
    icon: require("../assets/tabs/home.png") as number,
    iconSelected: require("../assets/tabs/home-selected.png") as number,
  },
  {
    name: "social",
    label: "소셜",
    icon: require("../assets/tabs/social.png") as number,
    iconSelected: require("../assets/tabs/social-selected.png") as number,
  },
  {
    name: "records",
    label: "기록",
    icon: require("../assets/tabs/record.png") as number,
    iconSelected: require("../assets/tabs/record-selected.png") as number,
  },
  {
    name: "ranking",
    label: "랭킹",
    icon: require("../assets/tabs/ranking.png") as number,
    iconSelected: require("../assets/tabs/ranking-selected.png") as number,
  },
  {
    name: "settings",
    label: "설정",
    icon: require("../assets/tabs/settings.png") as number,
    iconSelected: require("../assets/tabs/settings-selected.png") as number,
  },
] as const;

// 활성·비활성 색은 커스텀 바의 라벨 토큰과 같다.
// DynamicColorIOS라 라이트·다크 전환을 시스템이 처리한다.
const ACTIVE = DynamicColorIOS({
  light: softBlue.tab.labelActive.light,
  dark: softBlue.tab.labelActive.dark,
});
const INACTIVE = DynamicColorIOS({
  light: softBlue.tab.labelInactive.light,
  dark: softBlue.tab.labelInactive.dark,
});

// 실측 iOS 탭 선택 애니메이션 길이에 맞춘 값. 기기에서 여전히 밀려 보이면 늘린다.
const SWAP_AFTER_SELECTION_MS = 250;

// 설정 라우트가 끝내 상태에 실려 오지 않으면 재생 버튼과 날짜 줄이 돌아오지 않아, 이만큼 기다린 뒤 기다림을 버린다.
const REVEAL_TIMEOUT_MS = 1000;

export function NativeTabsLayout() {
  const homeChrome = rendersNativeHomeChrome();
  const prominentKeySupported = Number.parseInt(String(Platform.Version), 10) >= 27;
  // 콜드 스타트 설정 링크면 첫 포커스가 설정이라 처음부터 설정 칸을 보여야 한다.
  const [activeRoute, setActiveRoute] = useState<string>(takeInitialActiveRoute);
  const prevRouteRef = useRef(activeRoute);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onHome = activeRoute === "index";
  const startKey = useSyncExternalStore(subscribeStartKey, getStartKey);
  const dark = useColorScheme() === "dark";
  // 탭 바가 웹뷰 바깥이라 전체 화면 라우트와 웹 모달을 웹이 `set-tab-bar`로 알려 줘야 한다.
  const tabBarState = useTabBarState();
  const blocked = tabBarState === "blocked";
  const hasDateBar = useHomeDateBar() !== null;
  const settingsHidden = homeChrome && onHome;
  const pendingRevealRef = useRef<(() => void) | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(revealTimerRef.current), []);

  // 숨긴 설정 트리거는 라우트가 내비게이터에서 빠져 있어서, 알림·링크가 설정을 열려면 칸부터 되살려야 한다.
  useEffect(
    () =>
      subscribeSettingsReveal((then) => {
        if (!settingsHidden) {
          then();
          return;
        }
        clearTimeout(swapTimerRef.current);
        clearTimeout(revealTimerRef.current);
        pendingRevealRef.current = then;
        setActiveRoute("settings");
        // 사용자가 탭을 눌러 기다림만 버린 경우에도 칸을 현재 라우트에 맞춰야 해서 기다림 여부와 상관없이 맞춘다.
        revealTimerRef.current = setTimeout(() => {
          pendingRevealRef.current = null;
          setActiveRoute(prevRouteRef.current);
        }, REVEAL_TIMEOUT_MS);
      }),
    [settingsHidden],
  );

  return (
    <NativeTabs
      tintColor={ACTIVE}
      hidden={tabBarState === "hidden"}
      iconColor={{ default: INACTIVE, selected: ACTIVE }}
      labelStyle={{
        default: { color: INACTIVE, fontFamily: "PretendardLight", fontSize: 11 },
        selected: { color: ACTIVE, fontFamily: "PretendardLight", fontSize: 11 },
      }}
      screenListeners={({ route }) => ({
        // 네이티브 누름은 JUMP_TO보다 먼저 오므로 getActiveTab()이 아직 출발 탭이다.
        tabPress: (event) => {
          // 재생 버튼은 늘 disabled라 선택되지 않고, 막힌 누름으로만 온다.
          if (route.name === "start") {
            // 웹 모달이 열린 동안은 다른 탭처럼 재생도 막는다.
            if (event.data.isPrevented && !blocked) {
              pressHomePlay();
            }
            return;
          }
          // 사용자가 고른 탭이 링크가 열려던 설정보다 우선한다.
          pendingRevealRef.current = null;
          if (event.data.isPrevented) {
            return;
          }
          const tab = TAB_BY_ROUTE_NAME[route.name];
          const fromTab = getActiveTab();
          // 활성 탭을 다시 누르는 것은 탭 이동이 아니다.
          // 커스텀 바도 활성 탭을 눌리지 않게 뒀다.
          if (tab === undefined || tab === fromTab) {
            return;
          }
          trackNativeEvent("tab_pressed", { tab, from_tab: fromTab, via: "tab_bar" });
        },
        // 브리지 핸들러가 `navigate-tab`의 출발 탭을 읽을 수 있게 모듈 스코프에 기록한다(`lib/activeTab.ts`).
        state: (event) => {
          const state = event.data.state;
          const name = state.routes[state.index]?.name ?? "index";
          setActiveTabRoute(name);
          // 커밋 직후에는 설정 라우트가 아직 상태에 없어 이동이 버려진다. 상태 이벤트가 그 라우트를 실어 올 때 이동한다.
          // 기다리는 동안 홈으로 되돌리면 설정 칸이 다시 빠지므로 칸 상태는 건드리지 않는다.
          const pendingReveal = pendingRevealRef.current;
          if (pendingReveal !== null) {
            prevRouteRef.current = name;
            if (state.routes.some((r) => r.name === "settings")) {
              clearTimeout(revealTimerRef.current);
              pendingRevealRef.current = null;
              pendingReveal();
            }
            return;
          }
          // 설정에서 홈으로 가면 선택 표시가 설정 칸에서 출발하는데, 같은 순간 설정 칸을 빼면 재생 버튼이 그 애니메이션에 휩쓸려 오른쪽 아래에서 밀려 들어온다.
          // 선택 이동이 끝난 뒤에 바꿔 끼운다.
          const fromSettings = prevRouteRef.current === "settings" && name === "index";
          prevRouteRef.current = name;
          clearTimeout(swapTimerRef.current);
          if (fromSettings) {
            swapTimerRef.current = setTimeout(() => setActiveRoute(name), SWAP_AFTER_SELECTION_MS);
          } else {
            setActiveRoute(name);
          }
        },
      })}
      unstable_nativeProps={{
        ios: {
          // iOS 27은 search 역할 탭을 더 이상 떼어 그리지 않고 지정한 탭 하나를 떼어 그린다.
          // iOS 26은 role="search"가 스스로 떼어 그려서 넘기면 경고만 난다.
          ...(prominentKeySupported && onHome && startKey !== undefined
            ? { prominentScreenKey: startKey }
            : {}),
          // 액세서리를 넣고 빼면 탭 바가 다시 그려지므로 늘 두고 숨김만 바꾼다.
          bottomAccessoryHidden: !onHome || !hasDateBar,
        },
      }}
    >
      {homeChrome && (
        <NativeTabs.BottomAccessory>
          <DateBarAccessory />
        </NativeTabs.BottomAccessory>
      )}
      {/* 자동 인셋 조정 끔
          켜 두면 첫 자식 사슬에서 찾은 웹뷰 스크롤 뷰의 인셋 조정이 never에서 automatic으로 바뀐다.
          그러면 웹이 CSS로 넣은 안전 영역 여백 위에 인셋이 한 번 더 붙는다.
          첫 자식이 스플래시인지 웹뷰인지에 따라 탭마다 결과가 달라지기도 한다. */}
      {TABS.map((tab) => (
        <NativeTabs.Trigger
          key={tab.name}
          name={tab.name}
          disabled={blocked}
          hidden={tab.name === "settings" && settingsHidden}
          disableAutomaticContentInsets
        >
          <NativeTabs.Trigger.Icon
            src={{ default: tab.icon, selected: tab.iconSelected }}
            renderingMode="template"
          />
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
      {homeChrome && (
        <NativeTabs.Trigger
          name="start"
          role="search"
          disabled
          hidden={!onHome}
          disableAutomaticContentInsets
        >
          {/* 유리 원의 배경색을 바꾸는 공개 API가 없어 primary 원과 흰 재생 아이콘을 구운 PNG로 원을 채운다. */}
          <NativeTabs.Trigger.Icon
            src={
              dark
                ? (require("../assets/tabs/play-disc-dark.png") as number)
                : (require("../assets/tabs/play-disc.png") as number)
            }
            renderingMode="original"
          />
          <NativeTabs.Trigger.Label>순공 시작</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}

/**
 * 탭 바 액세서리 안의 날짜 줄
 *
 * 시스템이 탭 바 위에 따로 띄우는 자리와 접힌 탭 바 줄 안의 자리에 하나씩 그린다.
 * 상태는 모듈 스코프에 있어서 둘이 같은 선택을 보인다.
 */
function DateBarAccessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  // 접힌 탭 바 줄 안의 자리는 따로 띄운 자리보다 낮다.
  return <HomeDateBar chipHeight={placement === "inline" ? 30 : 36} />;
}
