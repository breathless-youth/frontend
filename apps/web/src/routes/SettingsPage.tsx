import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { postToNative } from "@/lib/bridge";
import { hardNavigate } from "@/lib/hardNavigation";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { appVersionLabel, cameraPermissionRowLabel } from "@/features/settings/settingsInfo";
import { useCameraPermission } from "@/features/settings/useCameraPermission";

/**
 * 설정
 *
 * **프로필 설정 행은 ⚠️ 설정 화면의 행 배치 디자인은 미확정이라 섹션 구성은 잠정이다.
 *
 * ## 원본과의 의도적 차이 (BY-331 task-4-brief)
 *
 * 1. **카메라 권한 행**: 원본은 `expo-camera`로 OS 권한 상태를 **직접** 조회해 트레일링 토글에
 *    반영한다. 웹에는 그 API가 없어(Permissions API의 `camera`를 iOS WKWebView가 지원하지 않는다)
 *    한동안 토글 없이 고정 렌더했지만, 지금은 `useCameraPermission`이 브리지로 네이티브에 물어
 *    같은 토글을 되살린다. 값을 모르는 동안(브라우저 단독 모드·조회 실패)은 원본의
 *    `granted === null` 분기 그대로 트레일링을 비운다. `onPress`는 `Linking.openSettings()`
 *    대신 `postToNative({ type: "open-settings", atMs: Date.now() })`로 네이티브에 요청만
 *    보낸다 — 브라우저 단독 모드에서는 브리지가 없어 조용히 무동작한다.
 * 2. **버전 정보**: 원본은 `expo-constants`에서 직접 읽는다. 웹은 네이티브 셸이 없어 그 값을
 *    얻을 수 없으므로 네이티브 셸(BY-333)이 실어 보내는 쿼리 `appVersion`을 읽는다.
 */
export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const granted = useCameraPermission();

  return (
    <main
      data-testid="settings-page"
      // 홈·기록과 같은 규칙으로 상단 안전영역을 더한다 — 이 값이 빠져 있어 웹뷰에서 설정
      // 제목만 상태 바 쪽으로 올라붙었다(2026-08-01 실기기 확인). RN 원본의
      // `useSafeAreaInsets().top + 17`에 대응한다.
      className="min-h-dvh bg-background pb-6 pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <h1 className="text-2xl leading-[29px] font-bold text-foreground">설정</h1>

        <SettingsSection className="mt-[23px]" label="프로필">
          <SettingsRow
            label="프로필 설정"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              navigate({ pathname: "/profile", search: location.search });
            }}
          />
        </SettingsSection>

        <SettingsSection
          className="mt-5"
          label="측정"
          caption="권한은 시스템 설정에서 바꿀 수 있어요"
        >
          {/*
            토글이 아니라 **행 전체**가 시스템 설정을 여는 버튼이다(`user-flow.md` S6).
            권한이 꺼져 있어도 S2-3(권한 거부 안내)으로 보내지 않는다 — S2-3은 최초 세션 시작
            플로우의 화면이고, 설정 탭에서는 곧장 OS 설정으로 간다.
          */}
          <SettingsRow
            label="카메라 권한"
            // 상태를 모르는 동안(브라우저 단독 모드·조회 실패)은 트레일링을 비운다 —
            // `useCameraPermission` 주석 참고. 토글은 표시 전용이고 실제 변경은 OS에서만 된다.
            trailing={granted === null ? undefined : { kind: "toggle", granted }}
            accessibilityLabel={cameraPermissionRowLabel(granted)}
            onPress={() => {
              postToNative({ type: "open-settings", atMs: Date.now() });
            }}
          />
          {/*
            온보딩 가이드(G1~G5)로 **재진입**시키는 링크다(BY-334 온보딩 웹 이관에서 연결).
            가이드의 단계·전환은 이 화면이 전혀 알지 못한다. `entry=settings`는
            `features/onboarding/onboardingGuideSteps.ts`의 진입 출처 C.
            서브 문구("자리 이탈 · 휴대폰 사용 · 기기 조작을 기기 안에서만 측정해요")는 의도적으로
            달지 않는다 — 감지 3종 안내는 가이드 본문이 소유하고, 설정 행은 재진입 링크로만 남는다.
          */}
          <SettingsRow
            label="측정 기준 안내"
            trailing={{ kind: "chevron" }}
            onPress={() => {
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
              hardNavigate(`/contact${location.search}`);
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-6" label="약관 · 정보">
          {/*
            이용약관·개인정보처리방침은 **앱 안에서 직접 보여준다**(BY-257) — 웹에도 같은 문서가
            있지만 외부 브라우저로 내보내지 않는다. chevron(앱 내 이동)이 그대로 맞는 표기다.
            본문은 `features/settings/legalDocuments.ts`가 소유하고 이 화면은 라우트만 안다.
          */}
          <SettingsRow
            label="이용약관"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              navigate("/terms");
            }}
          />
          <SettingsRow
            label="개인정보처리방침"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              navigate("/privacy");
            }}
          />
          <SettingsRow
            label="오픈소스 라이선스"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              navigate("/licenses");
            }}
          />
          {/* 트레일링이 값 텍스트뿐이라 탭 불가 — chevron이 없다는 것이 그 표시다. */}
          <SettingsRow
            label="버전 정보"
            trailing={{ kind: "value", value: appVersionLabel(searchParams.get("appVersion")) }}
          />
        </SettingsSection>
      </div>
    </main>
  );
}
