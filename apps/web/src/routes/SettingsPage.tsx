import { Info } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ToastViewport } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trackOsSettingsOpened, trackSettingsRowPressed } from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import { copyText } from "@/lib/clipboard";
import { hardNavigate } from "@/lib/hardNavigation";
import { useToast } from "@/lib/useToast";
import { consumeProfileSavedNotice } from "@/features/profile/profileSavedNotice";
import { PermissionToggle } from "@/features/settings/PermissionToggle";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { appVersionLabel, cameraPermissionRowLabel } from "@/features/settings/settingsInfo";
import { useCameraPermission } from "@/features/settings/useCameraPermission";
import { detectStorePlatform } from "@/features/social-room/storeLink";

/**
 * 설정
 *
 * 1. 카메라 권한 행: 원본은 `expo-camera`로 OS 권한 상태를 직접 조회해 트레일링 토글에 반영한다.
 *    웹에는 그 API가 없어(Permissions API의 `camera`를 iOS WKWebView가 지원하지 않는다)
 *    한동안 토글 없이 고정 렌더했지만, 지금은 `useCameraPermission`이 브리지로 네이티브에 물어
 *    같은 토글을 되살린다. 값을 모르는 동안(브라우저 단독 모드·조회 실패)은 원본의
 *    `granted === null` 분기 그대로 트레일링을 비운다. `onPress`는 `Linking.openSettings()`
 *    대신 `postToNative({ type: "open-settings", atMs: Date.now() })`로 네이티브에 요청만
 *    보낸다 — 브라우저 단독 모드에서는 브리지가 없어 조용히 무동작한다.
 * 2. 버전 정보: 원본은 `expo-constants`에서 직접 읽는다. 웹은 네이티브 셸이 없어 그 값을
 *    얻을 수 없으므로 네이티브 셸이 실어 보내는 쿼리 `appVersion`을 읽는다. 여기에 웹
 *    자체 버전(`__WEB_VERSION__`)을 합쳐 한 줄로 보여준다 - 앱과 웹이 각자 배포되기 때문에
 *    둘 중 하나만으로는 사용자가 무엇을 쓰고 있는지 알 수 없다.
 */
/** 네이티브 탭 바 복귀 애니메이션이 끝나기를 기다리는 지연(ms) — SettingsPage 토스트 주석 참고. */
const PROFILE_SAVED_TOAST_DELAY_MS = 450;

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const granted = useCameraPermission();

  // 프로필 저장 성공 복귀 토스트(2026-08-25 BY-427 시안 A). 플래그는 1회성이라 소비 결과를
  // ref에 고정한다 — StrictMode가 이펙트를 두 번 돌려도 두 번째 소비가 false로 굳지 않는다.
  //
  // 표시는 지연한다: /profile은 탭 바 숨김 라우트라 복귀 순간 네이티브 탭 바가 애니메이션으로
  // 되돌아오며 웹뷰 높이가 줄어드는데, 그동안 하단 고정 토스트가 리사이즈를 따라 눈에 띄게
  // 움직였다(2026-08-25 실기기 피드백). 복귀 애니메이션이 끝난 뒤에 등장시킨다.
  const { message: toastMessage, showToast } = useToast();
  const profileSavedRef = useRef<boolean | null>(null);
  profileSavedRef.current ??= consumeProfileSavedNotice();
  useEffect(() => {
    if (profileSavedRef.current !== true) {
      return;
    }
    const timer = setTimeout(() => {
      showToast("프로필이 저장됐어요");
    }, PROFILE_SAVED_TOAST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [showToast]);

  const versionLabel = appVersionLabel(
    searchParams.get("appVersion"),
    __WEB_VERSION__,
    detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints),
  );

  const handleCopyVersion = async () => {
    // clipboard 는 비보안 컨텍스트·구형 웹뷰에서 없거나 거부될 수 있다. copyText 가 그 경우
    // false 를 주므로 성공·실패를 갈라 안내한다.
    const copied = await copyText(versionLabel);
    showToast(copied ? "버전을 복사했어요" : "복사하지 못했어요");
  };

  return (
    <main
      data-testid="settings-page"
      // 홈·기록과 같은 규칙으로 상단 안전영역을 더한다 — 이 값이 빠져 있어 웹뷰에서 설정
      // 제목만 상태 바 쪽으로 올라붙었다(2026-08-01 실기기 확인). RN 원본의
      // `useSafeAreaInsets().top + 17`에 대응한다.
      // theme-soft-blue: 이 화면 서브트리에서만 V2 팔레트를 켠다. bg-soft-blue 가 배경 그라디언트.
      className="theme-soft-blue bg-soft-blue min-h-dvh pb-6 pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <h1 className="text-2xl leading-[29px] font-bold text-foreground">설정</h1>

        <SettingsSection className="mt-[23px]" label="프로필">
          <SettingsRow
            label="프로필 수정"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("profile");
              navigate({ pathname: "/profile", search: location.search });
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-5" label="서비스">
          {/*
            카메라 권한 행만 SettingsRow 를 쓰지 않고 직접 조립한다 — 행을 여는 버튼과 안내 ⓘ
            툴팁 버튼 두 인터랙티브가 한 행에 있어, 행 전체를 <button> 으로 감싸면 버튼이 중첩된다.
            라벨만 시스템 설정을 여는 버튼이고, ⓘ 는 그 옆의 별도 버튼, 토글은 표시 전용이다.
            권한이 꺼져 있어도 S2-3(권한 거부 안내)으로 보내지 않는다 — 설정 탭에서는 곧장 OS 설정으로 간다.
          */}
          <div className="flex min-h-11 flex-row items-center justify-between gap-3 py-[14px]">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                aria-label={cameraPermissionRowLabel(granted)}
                onClick={() => {
                  trackOsSettingsOpened("settings_tab");
                  postToNative({ type: "open-settings", atMs: Date.now() });
                }}
                // 텍스트만으로는 높이가 19라 44 터치 기준에 못 미친다 — 세로 음수 마진으로
                // 행 높이는 키우지 않으면서 버튼 자체를 44 로 만든다.
                className="text-foreground -my-3 flex min-h-11 items-center text-base leading-[19px]"
              >
                카메라 권한
              </button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    aria-label="카메라 권한 안내"
                    className="text-text-tertiary -my-3 flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)]"
                  >
                    <Info size={16} aria-hidden="true" />
                  </TooltipTrigger>
                  {/* 배경음 시트 툴팁은 세션 서브트리 변수를 쓰는데 이 화면엔 없어, 배경·글자를
                      전역 토큰으로 덮는다. */}
                  <TooltipContent
                    side="bottom"
                    align="start"
                    className="bg-foreground text-background"
                  >
                    권한은 시스템 설정에서 바꿀 수 있어요
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {/* 상태를 모르는 동안(브라우저 단독 모드·조회 실패)은 토글을 비운다. */}
            {granted !== null && <PermissionToggle granted={granted} />}
          </div>
          {/*
            온보딩 가이드(G1~G5)로 **재진입**시키는 링크다(BY-334 온보딩 웹 이관에서 연결).
            가이드의 단계·전환은 이 화면이 전혀 알지 못한다. `entry=settings`는
            `features/onboarding/onboardingGuideSteps.ts`의 진입 출처 C.
          */}
          <SettingsRow
            label="서비스 이용 가이드"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("guide");
              // 홈과 같은 승계 패턴(리뷰 반영) — entry만 하드코딩해 얹으면 userId·appVersion이
              // 사라져 가이드에서 새로고침·딥링크 후 폴백 이탈 시 미저장 모드 홈으로 떨어진다
              // (BY-327과 같은 유형의 쿼리 유실 버그).
              const params = new URLSearchParams(location.search);
              params.set("entry", "settings");
              navigate({ pathname: "/onboarding-guide", search: params.toString() });
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-5" label="지원">
          {/*
            문의 폼은 **앱 안에서 iframe으로 띄운다**(BY-257) — 외부 브라우저로 나가지 않으므로
            chevron(앱 내 이동)이고, "외부 브라우저로 열려요" 힌트를 붙이지 않는다.
            약관·방침과 달리 텍스트로 옮길 수 없다: 응답을 제출해야 하는 인터랙티브 폼이다.
          */}
          <SettingsRow
            label="문의하기"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              // SPA `navigate()`가 아니라 **문서 단위 내비게이션**이어야 한다
              // (`lib/hardNavigation.ts`) — /contact만 COEP 없이 내려오는데(vercel.json),
              // pushState는 문서를 새로 만들지 않아 이 문서(설정)의 `require-corp`를 승계해
              // 구글 폼 iframe이 차단된다. 쿼리는 통째로 승계한다 — 측정 기준 안내 행과
              // 같은 이유(딥링크·새로고침 후 쿼리 유실 방지, BY-327 유형).
              trackSettingsRowPressed("contact");
              hardNavigate(`/contact${location.search}`);
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-6" label="약관 · 정보">
          {/*
            이용약관·개인정보처리방침은 앱 안에서 직접 보여준다 — 웹에도 같은 문서가 있지만 외부 브라우저로 내보내지 않는다.
            본문은 `features/settings/legalDocuments.ts`가 소유하고 이 화면은 라우트만 안다.
          */}
          <SettingsRow
            label="이용약관"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("terms");
              navigate("/terms");
            }}
          />
          <SettingsRow
            label="개인정보처리방침"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("privacy");
              navigate("/privacy");
            }}
          />
          <SettingsRow
            label="오픈소스 라이선스"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("licenses");
              navigate("/licenses");
            }}
          />
          <SettingsRow
            label="버전 정보"
            trailing={{ kind: "copy", value: versionLabel, onCopy: handleCopyVersion }}
          />
        </SettingsSection>
      </div>

      {/* 위치는 앱 전역 표준(ToastViewport) — 등장 페이드 업(BY-435)만 이 화면 개선으로 남긴다. */}
      <ToastViewport
        message={toastMessage}
        toastClassName="animate-[toast-rise_240ms_ease-out] motion-reduce:animate-none"
      />
    </main>
  );
}
