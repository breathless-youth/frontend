# BY-717 설정 · 프로필 수정 화면 V2 UI 적용

## 목표

설정과 프로필 수정 두 웹 화면을 Figma V2 시안(`S6 · 설정 & 프로필 수정 (Soft Blue)`)으로 바꾼다. 손으로 만들어 쓰던 입력, 칩, 토글, 아이콘을 `components/ui`의 shadcn 프리미티브로 교체하고, 시안이 바꾼 문구도 반영한다.

시안 노드: 설정 `5271:3431`, 프로필 수정 `5272:3454` (파일 `YcyImcuVORDbBneii41Byh`).

## 색: 화면 스코프 클래스

V2 팔레트가 코드에 처음 들어온다. `index.css`에 `.theme-soft-blue` 블록 하나를 두고 그 안에서만 기존 시맨틱 변수를 재정의한다. 전역 `:root`와 `packages/design-tokens`는 건드리지 않는다. 클래스를 설정·프로필 화면 루트에만 붙이므로 다른 화면은 바뀌지 않는다.

BY-716(소셜 3화면)이 같은 클래스를 소셜 루트에 붙인다. 두 브랜치가 동일 값·동일 변수명으로 self-contained하게 두고, 별도 컷오버 티켓에서 세 스코프를 `:root`로 합친다.

### 라이트 값 (기존 index.css 변수명 기준)

- `--primary: #3671cf`
- `--primary-foreground: #ffffff`
- `--foreground: #1f2a3d`
- `--muted-foreground: #556173`
- `--text-tertiary: #b3bccb`
- `--border: #e8eef8`
- `--muted: #ffffff` (카드·입력 배경)

`--state-distract` 계열은 넣지 않고 `:root` V1 값을 상속한다. 설정·프로필엔 휴식·이벤트 색이 없다.

### 다크 값 (Soft Blue Dark 모드 5283:0)

- `--primary: #5a90ea`
- `--foreground: #eaf0f9`
- `--muted-foreground: #9fabc0`
- `--text-tertiary: #6b7789`
- `--border: #2a3752`
- `--muted: #1b2333`

`@media (prefers-color-scheme: dark):not([data-theme="light"])`와 `:root[data-theme="dark"] .theme-soft-blue` 두 셀렉터로 얹는다. 값은 A단계에서 Figma 다크 프레임을 조립·승인한 뒤 최종 확정한다.

### 배경 그라디언트 · 그림자

배경 3단 그라디언트는 단색 변수로 담기지 않아 `--background` 대체가 아니라 별도 유틸/인라인으로 둔다. `shadow/card-soft-blue`(`#3F78DA14`, offset 0/6, blur 22)는 별도 토큰으로 넣는다.

## A단계: Figma 다크 프레임 조립

설정·프로필 다크 프레임이 Figma에 없다. 라이트 프레임을 복제해 Soft Blue Dark 모드(`5283:0`)를 적용하고, 그라디언트와 상태바를 다크로 교체한다. 텍스트는 복제라 그대로 두어 폰트 잠금 영향을 피한다. 스크린샷으로 승인받은 뒤 그 값으로 다크 블록을 확정한다.

## B단계: 토큰 · 프리미티브

- `index.css`: `.theme-soft-blue` 라이트·다크, `shadow/card-soft-blue` 토큰.
- `Input` shadcn 추가 (radix 의존성 없음).
- `ToggleGroup` shadcn 추가 (새 의존성 `@radix-ui/react-toggle-group`, 승인됨).
- `button.tsx` `cva`에 56px 크기 추가.

## C단계: 구현 (TDD)

- `SettingsRow`: 손으로 그린 `<svg>` 셰브런·외부링크를 lucide `ChevronRight`·`ExternalLink`로. ⓘ 툴팁(배경음 시트 패턴), 버전 복사 아이콘 `Copy`.
- `PermissionToggle`: off 트랙 색 `#e9e9ea`를 토큰으로. 표시 전용 유지.
- `SettingsPage`: 섹션 `측정`→`서비스`, `측정 기준 안내`→`서비스 이용 가이드`, `프로필 설정`→`프로필 수정`, 카메라 캡션→ⓘ 툴팁, `.theme-soft-blue` 루트, 배경 그라디언트, 카드 그림자.
- `ProfilePage`: 맨 `<input>` 2개를 `Input`으로, 칩을 `ToggleGroup`으로, 본문 제목 제거하고 헤더에 `프로필 수정`, 저장 버튼을 `Button` 56px로, `.theme-soft-blue` 루트.

## D단계: 검증

- 라이트·다크 스크린샷 화면당 한 장씩 총 4장.
- 44px 터치 타겟, aria, 대비 점검(`accessibility-audit`).
- reduced-motion에서 칩·버튼 전환 애니메이션 제외.
- `settingsPage.test.tsx`, `settingsSubPages.test.tsx`, `settingsComponents.test.tsx`, `ProfilePage.test.tsx`가 바뀐 문구 기준으로 통과.

## 기록해 둘 것

- 문의하기 external 아이콘은 실제로는 앱 내 iframe으로 열려 동작과 어긋난다. PR에 적는다.
- `ProfileAvatar` 팔레트는 brand 단일 그대로 둔다. 시안도 단색이다.

## 완료 조건

- 두 화면이 시안의 배경 그라디언트·흰 카드·그림자·반경을 쓴다.
- `.theme-soft-blue`가 없는 화면은 색이 바뀌지 않는다.
- 입력·칩·저장 버튼·툴팁이 shadcn 프리미티브를 쓴다.
- 셰브런·외부링크·ⓘ·복사가 모두 lucide이고 색이 토큰을 따른다.
- 버전 복사가 동작하고 토스트로 알린다.
- 누를 수 있는 요소가 모두 44px 이상이다.
- 라이트·다크 스크린샷 4장을 남긴다.
