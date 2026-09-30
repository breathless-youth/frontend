import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { trackOsSettingsOpened, trackSettingsRowPressed } from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import { copyText } from "@/lib/clipboard";
import { hardNavigate } from "@/lib/hardNavigation";
import { slideNavigate } from "@/lib/pageTransition";
import { showToast } from "@/lib/toast";
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
 *    보낸다. 브라우저 단독 모드에서는 브리지가 없어 아무 동작도 하지 않는다.
 * 2. 버전 정보: 원본은 `expo-constants`에서 직접 읽는다. 웹은 네이티브 셸이 없어 그 값을
 *    얻을 수 없으므로 네이티브 셸이 실어 보내는 쿼리 `appVersion`을 읽는다. 여기에 웹
 *    자체 버전(`__WEB_VERSION__`)을 합쳐 한 줄로 보여준다. 앱과 웹이 각자 배포되기 때문에
 *    둘 중 하나만으로는 사용자가 무엇을 쓰고 있는지 알 수 없다.
 */
export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const granted = useCameraPermission();

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
      // 홈·기록과 같은 규칙으로 상단 안전영역을 더한다.
      // 이 값이 빠져 있어 웹뷰에서 설정 제목만 상태 바 쪽으로 올라붙었다.
      // RN 원본의 `useSafeAreaInsets().top + 17`에 대응한다.
      // theme-soft-blue: 이 화면 서브트리에서만 V2 팔레트를 켠다. bg-soft-blue 가 배경 그라디언트.
      className="theme-soft-blue bg-soft-blue min-h-dvh pb-[var(--tab-bar-reserve)] pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <h1 className="text-2xl leading-[29px] font-bold text-foreground">설정</h1>

        <SettingsSection className="mt-[23px]" label="프로필">
          <SettingsRow
            label="프로필 수정"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("profile");
              slideNavigate("forward", () =>
                navigate({ pathname: "/profile", search: location.search }),
              );
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-5" label="서비스">
          {/*
            카메라 권한 행은 SettingsRow 없이 직접 조립한다.
            라벨 버튼은 OS 설정을 열고 ⓘ 툴팁도 따로 버튼이라 행 전체를 <button>으로 감싸면 버튼이 중첩된다.
            토글은 표시 전용이다.
          */}
          <div className="flex min-h-11 flex-row items-center justify-between gap-3 py-[14px]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="text-foreground text-base leading-[19px]">카메라 권한</span>
              <InfoTooltip label="카메라 권한 안내">
                권한은 시스템 설정에서 바꿀 수 있어요
              </InfoTooltip>
            </div>
            {/* 상태를 모르는 동안(브라우저 단독 모드·조회 실패)은 토글을 비운다. */}
            {granted !== null && (
              <button
                type="button"
                aria-label={cameraPermissionRowLabel(granted)}
                onClick={() => {
                  trackOsSettingsOpened("settings_tab");
                  postToNative({ type: "open-settings", atMs: Date.now() });
                }}
                // 텍스트만으로는 높이가 19px라 세로 음수 마진으로 행 높이는 그대로 두고 버튼만 44px로 만든다.
                className="relative after:absolute after:inset-0 after:content-[''] -my-[6.5px] flex min-h-11 shrink-0 items-center rounded-full focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none"
              >
                <PermissionToggle granted={granted} />
              </button>
            )}
          </div>
          {/*
            온보딩 가이드로 다시 들어가는 행이다.
            `entry=settings`는 `features/onboarding/onboardingGuideSteps.ts`에 정의된 진입 출처다.
          */}
          <SettingsRow
            label="서비스 이용 가이드"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("guide");
              // 홈과 같은 방식으로 지금 쿼리를 이어받고 entry만 바꾼다.
              // entry만 넣은 새 쿼리로 가면 userId·appVersion이 사라져, 가이드에서 새로고침하거나 딥링크로 들어왔다가 나갈 때 미저장 모드 홈으로 떨어진다.
              const params = new URLSearchParams(location.search);
              params.set("entry", "settings");
              slideNavigate("forward", () =>
                navigate({ pathname: "/onboarding-guide", search: params.toString() }),
              );
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-5" label="지원">
          {/*
            문의 폼은 앱 안에서 iframe으로 띄운다.
            외부 브라우저로 나가지 않으므로 앱 내 이동을 뜻하는 chevron을 쓴다.
            약관·방침과 달리 텍스트로 옮길 수 없다: 응답을 제출해야 하는 인터랙티브 폼이다.
          */}
          <SettingsRow
            label="문의하기"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              // SPA `navigate()`가 아니라 문서 단위 이동인 `hardNavigate`를 써야 한다.
              // vercel.json 설정상 /contact만 COEP 없이 내려오는데, pushState는 문서를 새로 만들지 않아 설정 문서의 `require-corp`를 그대로 이어받고 구글 폼 iframe이 차단된다.
              // 쿼리는 측정 기준 안내 행과 같은 이유로 통째로 이어받아, 딥링크나 새로고침 뒤에도 사라지지 않게 한다.
              trackSettingsRowPressed("contact");
              hardNavigate(`/contact${location.search}`);
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-6" label="약관 · 정보">
          {/*
            이용약관·개인정보처리방침은 앱 안에서 직접 보여준다.
            웹에도 같은 문서가 있지만 외부 브라우저로 내보내지 않는다.
            본문은 `features/settings/legalDocuments.ts`가 소유하고 이 화면은 라우트만 안다.
          */}
          <SettingsRow
            label="이용약관"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("terms");
              slideNavigate("forward", () => navigate("/terms"));
            }}
          />
          <SettingsRow
            label="개인정보처리방침"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("privacy");
              slideNavigate("forward", () => navigate("/privacy"));
            }}
          />
          <SettingsRow
            label="오픈소스 라이선스"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              trackSettingsRowPressed("licenses");
              slideNavigate("forward", () => navigate("/licenses"));
            }}
          />
          <SettingsRow
            label="버전 정보"
            trailing={{ kind: "copy", value: versionLabel, onCopy: handleCopyVersion }}
          />
        </SettingsSection>
      </div>
    </main>
  );
}
