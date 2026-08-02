import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryCtaButton } from "./PrimaryCtaButton";

/**
 * U1 업데이트 안내 시트 (`frontend/docs/screens/SCR-U1-update-sheet.md`).
 * Figma `Sheet / Bottom`(컴포넌트 `44:96`, 사용처 `67:840` → 인스턴스 `67:853`).
 *
 * **순수 프레젠테이션 컴포넌트다** — 노출 플래그를 직접 읽지 않는다(`visible`만 받는다).
 * 게이트는 `lib/updateNotice.ts`, 상태 보유는 `UpdateNoticeSheetHost`가 맡는다.
 *
 * ## 이 시트가 아닌 것
 *
 * 이름에 "업데이트"가 들어가지만 **앱 버전 업데이트를 강요·유도하는 시트가 아니다.**
 * V1.2에 로그인이 추가된다는 예고 안내다. 스토어 이동 버튼, "지금 업데이트"/"나중에" 같은
 * 문구, 강제/선택 업데이트 분기를 넣지 않는다 — Figma에 변형이 없고 wiki에 정의가 없다
 * (스펙 Content·Exposure Control). 닫는 방법은 `확인` CTA 하나다.
 *
 * ## 새 라이브러리를 쓰지 않는다
 *
 * RN 코어 `Modal` + `Animated`로 충분하다. `@gorhom/bottom-sheet` 같은 바텀시트 라이브러리를
 * 추측으로 설치하지 않는다(루트 CLAUDE.md "검증되지 않은 라이브러리 추측 설치 금지").
 */

/**
 * 딤 = `rgba(0,0,0,0.6)`. **시맨틱 토큰 `colors.bg.dim`을 쓰지 않는다.**
 *
 * 토큰의 라이트값은 `#00000066`(40%)라 Figma와 20%p 어긋난다. 반면 Figma 쪽 근거는 세 곳이
 * 모두 60%로 일치한다: 프레임 실측(`67:852` fill `rgba(0,0,0,0.6)`) · `Sheet / Bottom` 컴포넌트
 * 설명("black 60% 딤 위") · `6. Spec — Motion & Handoff` §4-⑦("시트·다이얼로그 딤 = black 60%").
 * Figma가 이 화면의 시각적 SSOT이므로 실측값을 쓰고, 라이트/다크 공통으로 적용한다.
 *
 * TODO(SCR-U1-update-sheet.md Review Checklist): 딤 불투명도 불일치 정리 — `bg/dim` 토큰을
 *   60%로 정정할지, 시트·다이얼로그 전용 딤 토큰을 신설할지 확정 필요(S3-7 종료 확인
 *   다이얼로그에도 같은 문제가 적용된다). 확정되면 이 상수를 토큰 참조로 바꾼다.
 */
export const UPDATE_NOTICE_DIM_COLOR = "rgba(0,0,0,0.6)";

/** 모션 — `6. Spec — Motion & Handoff`(`73:6`) 실측값. */
export const updateNoticeMotion = {
  /** 시트 y-슬라이드 320ms · cubic-bezier(0.32, 0.72, 0, 1). */
  sheetSlideMs: 320,
  /** 딤 fade 250ms. Spec 페이지에 easing 명시가 없어 `Animated` 기본값을 쓴다. */
  dimFadeMs: 250,
} as const;

const SHEET_EASING_IN = Easing.bezier(0.32, 0.72, 0, 1);

/**
 * 닫힘 모션은 **Spec 페이지에 확정값이 없다**(여는 값만 존재). 스펙 지시대로 "여는 모션의
 * 역재생"으로 둔다 — 시간축을 뒤집은 큐빅 베지어는 (1-x2, 1-y2, 1-x1, 1-y1)이다.
 * TODO(SCR-U1-update-sheet.md Review Checklist): 닫힘 모션 값 확정 시 교체.
 */
const SHEET_EASING_OUT = Easing.bezier(1, 0, 0.68, 0.28);

/**
 * 측정 전 초기 오프셋. 시트 높이는 콘텐츠에 따라 달라져 고정할 수 없으므로(폰트 확대 대응 —
 * 스펙 Accessibility) 첫 프레임에서는 화면 높이만큼 밀어 확실히 화면 밖에 둔다. 실제 높이는
 * `onLayout`으로 측정해 그 값에서 슬라이드를 시작한다.
 */
const OFFSCREEN_FALLBACK_Y = Dimensions.get("window").height;

/** Figma 실측 pad bottom 44px — iOS 홈 인디케이터 영역을 포함한 값이라 인셋의 **하한**으로 쓴다. */
const SHEET_MIN_BOTTOM_PAD = 44;

/**
 * 아직 확정되지 않은 닫기 경로들(스펙 Interaction Contract의 "미정" 3행).
 * 이 prop을 넘기지 않으면 세 경로 모두 **막힌다** — 그게 현재 기본값이다.
 */
export type UpdateNoticeDismissSource = "dim-press" | "swipe-down" | "hardware-back";

export function UpdateNoticeSheet({
  visible,
  onConfirm,
  onDismissRequest,
}: {
  visible: boolean;
  /** `확인` CTA. 프레임의 **유일한** 핫스팟(`70:1222`)이자 지금 유일하게 연결된 닫기 경로다. */
  onConfirm: () => void;
  /**
   * 딤 탭 · 아래로 스와이프 · Android 백 버튼으로 닫는 동작은 **전부 미정이다** — Figma에
   * 핫스팟이 없고 wiki에도 규정이 없다. 그래서 동작을 켜지 않고 **콜백 자리만** 열어 둔다.
   * 넘기지 않으면(기본) 세 경로 모두 아무 일도 일어나지 않는다.
   *
   * 세 경로를 한 콜백으로 묶은 것은 의도적이다 — 어느 경로로 닫히든 "닫힘 처리 + seen 저장"이
   * 한 함수로 가야 중복 노출 버그가 생기지 않는다(스펙 지시).
   *
   * TODO(SCR-U1-update-sheet.md Interaction Contract): 닫기 경로 확정 필요.
   *   - `dim-press` / `hardware-back`: 아래에 배선돼 있어 prop만 넘기면 바로 동작한다.
   *   - `swipe-down`: 제스처 인식기 자체를 달지 않았다(임계값·따라오는 드래그 동작이 미정).
   *     핸들(`44:89`)이 있어 사용자가 스와이프를 기대할 수 있지만, 핸들 존재만으로 제스처를
   *     임의 확정하지 않는다. 확정되면 여기에 `PanResponder`를 붙이고 이 콜백을 호출한다.
   */
  onDismissRequest?: (source: UpdateNoticeDismissSource) => void;
}) {
  const insets = useSafeAreaInsets();

  // 닫힘 모션을 끝까지 보여주려면 `visible`이 false가 된 뒤에도 잠깐 더 마운트돼 있어야 한다.
  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(OFFSCREEN_FALLBACK_Y)).current;
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const sheetHeight = useRef(OFFSCREEN_FALLBACK_Y);
  /**
   * 열림 애니메이션을 이미 시작했는가(레이아웃이 여러 번 와도 한 번만 시작).
   *
   * ⚠️ 열림 시작점이 `onLayout`뿐이라 **같은 마운트에서의 재오픈은 지원하지 않는다** —
   * 닫힘 모션이 끝나기 전에 `visible`이 다시 true가 되면 레이아웃이 재발화하지 않아
   * `runOpen`이 불리지 않고, 중단된 닫힘 모션이 남긴 중간 위치에 시트가 멈춘다.
   * 현재 `visible`을 true로 되돌리는 경로가 없어 도달 불가다.
   * TODO(SCR-U1-update-sheet.md Review Checklist): 공지 ID 단위 재노출이 도입되면
   *   `lib/updateNotice.ts`의 같은 TODO와 함께 처리한다 — 아래 `useEffect`에서
   *   `visible && !opened.current && sheetHeight.current > 0`일 때 직접 `runOpen`을 부르면 된다.
   */
  const opened = useRef(false);

  const runOpen = useCallback(
    (fromY: number) => {
      translateY.setValue(fromY);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: updateNoticeMotion.sheetSlideMs,
          easing: SHEET_EASING_IN,
          useNativeDriver: true,
        }),
        Animated.timing(dimOpacity, {
          toValue: 1,
          duration: updateNoticeMotion.dimFadeMs,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [translateY, dimOpacity],
  );

  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }
    if (!opened.current) {
      // 한 번도 열린 적 없으면 닫힘 모션도 없다 — 기본(플래그 꺼짐) 경로가 바로 여기다.
      setRendered(false);
      return;
    }
    opened.current = false;
    const closing = Animated.parallel([
      Animated.timing(translateY, {
        toValue: sheetHeight.current,
        duration: updateNoticeMotion.sheetSlideMs,
        easing: SHEET_EASING_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(dimOpacity, {
        toValue: 0,
        duration: updateNoticeMotion.dimFadeMs,
        useNativeDriver: true,
      }),
    ]);
    closing.start(({ finished }) => {
      if (finished) {
        setRendered(false);
      }
    });
    return () => closing.stop();
  }, [visible, translateY, dimOpacity]);

  /**
   * 시트 높이는 콘텐츠가 정한다(폰트 확대 시 늘어남) — 그래서 슬라이드 시작 지점도 여기서
   * 정해진다. 높이를 알게 된 순간 열림 모션을 시작한다.
   */
  const onSheetLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      if (height <= 0) {
        return;
      }
      sheetHeight.current = height;
      if (visible && !opened.current) {
        opened.current = true;
        runOpen(height);
      }
    },
    [visible, runOpen],
  );

  if (!rendered) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      // 모션을 직접 제어하므로 OS 기본 프레젠테이션 애니메이션은 끈다.
      animationType="none"
      statusBarTranslucent
      // Android 하드웨어 백 버튼. RN이 이 prop을 요구하지만 **동작은 미정이라 기본 무동작**이다.
      onRequestClose={() => onDismissRequest?.("hardware-back")}
      testID="update-notice-sheet"
    >
      {/*
        시트는 모달이다 — 열려 있는 동안 뒤 홈 콘텐츠를 스크린리더 포커스에서 제외한다
        (`accessibilityViewIsModal`은 iOS, Android는 `Modal`이 같은 일을 한다).
        홈 요소 탭도 차단된다: U1 프레임에는 S1·S5·S6과 달리 탭바 핫스팟이 없다.
      */}
      <View className="flex-1 justify-end" accessibilityViewIsModal>
        <Animated.View
          pointerEvents="box-none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: UPDATE_NOTICE_DIM_COLOR, opacity: dimOpacity },
          ]}
        >
          {/* 딤은 장식이라 스크린리더에 노출하지 않는다. 탭은 받되 기본 동작은 없다(미정). */}
          <Pressable
            testID="update-notice-dim"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            onPress={() => onDismissRequest?.("dim-press")}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          onLayout={onSheetLayout}
          className="bg-bg-base dark:bg-bg-base-dark w-full items-center gap-2 rounded-t-[24px] px-5 pt-3"
          style={[
            {
              // Figma 44는 홈 인디케이터 영역을 포함한 값이다 — 인셋이 더 크면 인셋을 따른다.
              paddingBottom: Math.max(SHEET_MIN_BOTTOM_PAD, insets.bottom),
              transform: [{ translateY }],
            },
            // Figma Effect Style `shadow/sheet-up` = 0 -12 40 rgba(0,0,0,0.18).
            // blur 값을 그대로 `shadowRadius`에 넣는 것은 이 저장소의 기존 관례다
            // (`components/onboarding/coachOverlayTheme.ts`의 `cardShadow`).
            // Android `elevation`은 방향 있는 그림자를 표현하지 못해 근사값이다.
            {
              shadowColor: "#000000",
              shadowOffset: { width: 0, height: -12 },
              shadowOpacity: 0.18,
              shadowRadius: 40,
              elevation: 12,
            },
          ]}
        >
          {/*
            핸들(36×4)은 순수 장식이다 — 스크린리더에 노출하지 않고, 지금은 제스처도 연결돼
            있지 않으므로 "끌어서 닫기"로 안내하지 않는다.
          */}
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className="bg-border-strong dark:bg-border-strong-dark h-1 w-9 rounded-full"
          />

          <View className="w-full items-start gap-2 pt-2.5">
            {/* Figma 실측 19/23 Bold — heading.h3(18/26)와 달라 실측값을 쓴다. */}
            <Text
              accessibilityRole="header"
              className="text-text-primary dark:text-text-primary-dark text-[19px] font-bold leading-[23px]"
            >
              로그인이 곧 추가돼요
            </Text>
            {/*
              Figma 텍스트 레이어가 nowrap+clip이라 원본에서는 첫 줄이 잘려 보이지만, 구현에서는
              전문이 다 보여야 한다 — 줄바꿈은 폭에 맡기고 클립하지 않는다(스펙 Content).
              로그인 제공자는 Google·Apple만 언급한다(`policies.md` §2).
            */}
            <View className="w-full">
              <Text className="text-text-secondary dark:text-text-secondary-dark text-[14px] leading-[21px]">
                다음 업데이트부터 Google·Apple 계정으로 로그인할 수 있어요.
              </Text>
              <Text className="text-text-secondary dark:text-text-secondary-dark text-[14px] leading-[21px]">
                지금까지의 기록도 로그인하면 계정에 그대로 이어져요.
              </Text>
            </View>
          </View>

          {/* Figma `spacer` 44:95 (10×10) — 텍스트 블록과 CTA 사이 간격. */}
          <View className="size-2.5" />

          {/* Figma `Button / CTA` LG 362×52 — 기존 공용 컴포넌트를 그대로 쓴다. */}
          <PrimaryCtaButton label="확인" onPress={onConfirm} testID="update-notice-confirm" />
        </Animated.View>
      </View>
    </Modal>
  );
}
