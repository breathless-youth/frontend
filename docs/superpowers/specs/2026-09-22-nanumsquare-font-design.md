# 서비스 폰트 교체: Pretendard → NanumSquareRound

- Jira: BY-718 (부모), BY-719 (웹), BY-720 (모바일)
- 작성일: 2026-09-22
- base 브랜치: `dev`

## 배경

디자인 업그레이드에 맞춰 서비스 기본 폰트를 Pretendard에서 NanumSquareRound로 바꾼다. Figma V2 시안이 이미 NanumSquareRound로 조립돼 있어 코드와 시안의 폰트를 맞추는 작업이다.

핵심 제약은 폰트의 성격 차이다.

- Pretendard는 굵기 축이 연속인 가변 폰트라 `font-medium`(500)·`font-semibold`(600)가 그대로 렌더됐다.
- NanumSquareRound는 Light(300)·Regular(400)·Bold(700)·ExtraBold(800) 네 단계짜리 정적 폰트다. 500·600에 해당하는 파일이 없다.
- 서비스가 실제로 쓰는 굵기는 Regular·Bold 두 종(웹·모바일 공통)과, 웹의 복구 모달 제목 1곳에 쓰는 ExtraBold다. Light는 쓰는 곳이 없어 싣지 않는다.

굵기 매핑은 웹·모바일 공통이다.

- `font-medium`(500) → Regular(400)
- `font-semibold`(600) → Bold(700)
- `font-bold`(700) → Bold(700)
- 웹에만 있는 `font-extrabold`(800) 1곳(복구 모달 제목)은 ExtraBold(800) 전용 파일을 싣는다.

## 웹 (BY-719)

웹은 브라우저의 `@font-face` weight 매칭이 500·600을 자동으로 가까운 파일에 붙여주므로 화면 코드는 손대지 않는다.

### 변경

- `apps/web/public/fonts/`: `PretendardVariable.woff2` 제거, `NanumSquareRound-Regular.woff2`·`NanumSquareRound-Bold.woff2`·`NanumSquareRound-ExtraBold.woff2` R·B·EB 세 파일(EB는 복구 모달 제목 강조용, heading.emphasis 토큰) 추가.
- `apps/web/src/index.css`: `@font-face` 하나(가변)를 Regular(400)·Bold(700)·ExtraBold(800) 세 개로 교체. `--font-sans` 첫 항목을 `"NanumSquareRound"`로 바꾸고 시스템 폴백 체인은 유지.
- `apps/web/src/__tests__/fontStack.test.ts`: 단언을 NanumSquareRound와 세 woff2 파일 기준으로 갱신.
- `packages/design-tokens/src/index.ts`: 타이포 주석의 "Pretendard" 표현을 "NanumSquareRound"로 갱신. `typography.heading`에 `emphasis`(19/23/extrabold) 토큰 추가.

### 폰트 포맷

받은 파일은 TTF/OTF지만 기존 웹은 woff2를 쓴다. 관례에 맞춰 Regular·Bold TTF를 woff2로 변환해 싣는다. R.ttf 약 1MB가 woff2로 약 400KB가 된다.

### 서브셋 안 함

닉네임·스터디룸 이름 같은 사용자 입력 한글이 임의라, 글리프를 솎아내면 조용히 깨진다. 전체 한글 글리프를 유지한다.

## 모바일 (BY-720)

React Native는 한 패밀리에 `fontWeight`만 바꿔서는 정적 폰트의 굵기를 플랫폼 공통으로 보장하지 못한다. iOS는 굵기를 무시하고, 안드로이드는 가짜 굵게를 쓴다. 저장소 스킬 `expo-design-system`도 정적 폰트는 굵기별 패밀리 이름으로 지정하라고 명시한다.

### 로딩 방식

`useFonts`에 굵기별 키 두 개로 로드한다. `expo-font` 플러그인 네이티브 임베드는 폰트 이름을 플랫폼마다 다르게 잡는다. iOS는 PostScript 이름(`NanumSquareRoundR`·`NanumSquareRoundB`)을, 안드로이드는 파일명(`NanumSquareRound-Regular`·`-Bold`)을 써서 tailwind에 넣을 단일 패밀리 문자열이 양쪽에서 먹지 않는다. `useFonts`는 키가 곧 양 플랫폼 공통의 주소 이름이라 우리가 이름을 완전히 통제한다. 기존 코드가 `Pretendard` 키 하나로 쓰던 검증된 방식을 키 두 개로 늘리는 것이다.

### 변경

- `apps/mobile/assets/fonts/`: `PretendardVariable.ttf` 제거, `NanumSquareRound-Regular.ttf`·`NanumSquareRound-Bold.ttf` 추가.
- `apps/mobile/app/_layout.tsx`: `useFonts`의 키를 `NanumSquareRound`(Regular)·`NanumSquareRoundBold`(Bold) 두 개로 로드한다. 스플래시 유지 게이트는 폰트 로드와 강제 업데이트 판정을 함께 기다린다.
- `apps/mobile/tailwind.config.js`: `fontFamily.sans`를 `["NanumSquareRound"]`로, `fontFamily.sans-bold`를 `["NanumSquareRoundBold"]`로. 두 키가 useFonts 키와 일치한다.
- 굵기를 쓰는 화면 4곳: `font-semibold`·`font-bold`가 붙은 `font-sans`를 `font-sans-bold`로 바꾼다. `font-medium`은 Regular이므로 `font-sans` 그대로 둔다.
- `apps/mobile/__tests__/fontConfig.test.ts`: 단언을 NanumSquareRound·NanumSquareRoundBold 기준으로 갱신.

### 굵기 쓰는 화면

- `app/permission-denied.tsx`: 제목 `font-bold`, 부제 `font-medium`
- `components/RemoteWebViewHost.tsx`: 오류 제목 `font-bold`
- `components/PrimaryCtaButton.tsx`: 버튼 라벨 `font-bold`
- `components/TabBar.tsx`: 활성 탭 `font-semibold`, 비활성 탭 `font-medium`

## 검증

- 웹 vitest `fontStack` 갱신 후 통과.
- 모바일 vitest `fontConfig` 갱신 후 통과.
- 웹 dev 서버에서 라이트·다크 스크린샷으로 글꼴·굵기 대비 확인.
- 모바일은 Dev Client 실기기에서 Regular·Bold가 실제로 다르게 렌더되는지 확인. 이 검증이 정적 폰트의 조용한 굵기 실패를 잡는 핵심이다.
- typecheck·lint 통과.

## 하지 않는 것

- Light(300) 파일은 싣지 않는다. 현재 코드에 쓰는 곳이 없다. ExtraBold(800)는 웹의 복구 모달 제목 전용으로 싣는다(모바일은 사용처가 없어 제외).
- 굵기 클래스를 실제 굵기로 일괄 치환하는 코드 변경은 하지 않는다. 웹은 브라우저 매칭에 맡기고, 모바일만 패밀리 클래스를 바꾼다.
- 타이포 스케일(크기·행간) 변경은 범위 밖이다.
