import { useNavigate, useSearchParams } from "react-router-dom";

import { postToNative } from "@/lib/bridge";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { appVersionLabel, cameraPermissionRowLabel } from "@/features/settings/settingsInfo";

/**
 * S6 · 설정 — Figma node `67:722`, 스펙 `frontend/docs/screens/SCR-S6-settings.md`.
 * RN 원본 `apps/mobile/app/(tabs)/settings.tsx`의 웹 이식.
 *
 * **이 화면에서 앱이 직접 바꾸는 상태는 하나도 없다.** 설정은 "기능을 켜고 끄는 곳"이 아니라
 * "측정 방식을 이해하고, 권한을 확인하러 가는 곳"이다 — 카메라 권한은 OS 설정 앱에서만 바뀐다.
 *
 * **모든 행이 앱 안에 머문다**(BY-257). 문의는 `/contact`, 약관·방침은 `/terms`·`/privacy` —
 * 외부 브라우저로 나가는 행이 하나도 없다.
 *
 * V1.0 인벤토리에 없는 항목을 추가하지 않는다: 로그인·계정 삭제(V1.2+, `policies.md` §2),
 * 알림 설정(푸시 알림 정책이 `design.md` 백로그에 미정), 랭킹·프로필.
 * 폐기된 정적 안내 화면 S6-1도 만들지 않는다(가이드로 통합됨).
 *
 * ## 원본과의 의도적 차이 (BY-331 task-4-brief)
 *
 * 1. **카메라 권한 행**: 원본은 `expo-camera`로 OS 권한 상태를 조회해 트레일링 토글에 반영한다.
 *    웹은 그 API가 없으므로 상태 조회를 하지 않는다 — 원본의 `granted === null`(조회 전/실패)
 *    분기와 동일하게 트레일링을 생략한 채 고정 렌더한다. `onPress`는 `Linking.openSettings()`
 *    대신 `postToNative({ type: "open-settings", atMs: Date.now() })`로 네이티브에 요청만
 *    보낸다 — 수신 구현은 BY-333, 브라우저 단독 모드에서는 브리지가 없어 조용히 무동작한다.
 * 2. **측정 기준 안내 행**: 2026-07-30 결정 — 온보딩 가이드가 네이티브에 남아 있는 동안 연결
 *    보류(브리지 2종 제한). 온보딩 웹 이관 티켓에서 웹 내비게이션으로 연결. 그때까지는 표시만
 *    하고 `onPress`를 넘기지 않는다(버튼으로 노출되지 않는다).
 * 3. **버전 정보**: 원본은 `expo-constants`에서 직접 읽는다. 웹은 네이티브 셸이 없어 그 값을
 *    얻을 수 없으므로 네이티브 셸(BY-333)이 실어 보내는 쿼리 `appVersion`을 읽는다.
 */
export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  return (
    <main
      data-testid="settings-page"
      className="min-h-dvh bg-background pt-[17px] pb-6 text-foreground"
    >
      <div className="px-5">
        <h1 className="text-2xl leading-[29px] font-bold text-foreground">설정</h1>

        {/*
          섹션 간 간격은 Figma 실측이 균일하지 않다(타이틀→측정 23 · 캡션→지원 20 · 지원 카드→약관 24).
          균일 `gap`으로 뭉개면 캡션이 있는 구간만 어긋나므로 구간별 마진으로 둔다(S5와 같은 처리).
        */}
        <SettingsSection
          className="mt-[23px]"
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
            accessibilityLabel={cameraPermissionRowLabel(null)}
            onPress={() => {
              postToNative({ type: "open-settings", atMs: Date.now() });
            }}
          />
          {/*
            2026-07-30 결정 — 온보딩 가이드가 네이티브에 남아 있는 동안 연결 보류(브리지 2종 제한).
            온보딩 웹 이관 티켓에서 웹 내비게이션으로 연결.
          */}
          <SettingsRow label="측정 기준 안내" trailing={{ kind: "chevron" }} />
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
              navigate("/contact");
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
          {/*
            "오픈소스 라이선스" 행은 목적지도 문서도 아직 없다 — 임의의 placeholder 목적지를
            지어내지 않고 `onPress` 없이 표시만 한다(버튼으로 노출되지 않는다).
            TODO(SCR-S6-settings.md Review Checklist): 목적지 확정 필요.
          */}
          <SettingsRow label="오픈소스 라이선스" trailing={{ kind: "chevron" }} />
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
