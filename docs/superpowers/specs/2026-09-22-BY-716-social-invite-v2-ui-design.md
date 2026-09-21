# BY-716 소셜 홈·초대코드 V2 UI 변경 설계

## 배경

소셜 탭 세 화면이 Figma V2 `S3 · 소셜 (Soft Blue)` 시안으로 다시 그려졌다. 지금 코드는
V1 팔레트와 레이아웃을 쓴다. 대상 화면은 소셜 홈, 방 생성 완료, 초대코드 입력이고, 각각
라이트와 다크가 있다.

동시에 다른 두 세션이 같은 V2 개편을 하고 있다. BY-717은 설정·프로필을 `.theme-soft-blue`
스코프 클래스로 리스킨하고, BY-718은 폰트를 바꾼다. 셋 다 전역 `:root` 시맨틱 토큰은
건드리지 않기로 했다.

## 접근

전역 `:root` 값은 그대로 두고, Soft Blue 팔레트를 **`.theme-soft-blue` 스코프 클래스**로
정의해 소셜 세 화면의 루트에만 붙인다. 이러면 앱 전체 색은 그대로고 소셜 화면 안에서만
새 팔레트가 적용된다. 전역 `:root` 컷오버는 나중에 별도 티켓에서 세 스코프 작업을 한 벌로
합칠 때 한다.

클래스 이름과 값은 BY-717과 똑같이 맞춘다. 값 출처가 같은 Figma Soft Blue 모드라 두 브랜치의
정의가 동일하다. 머지 때 같은 셀렉터가 두 번 나오면 한 벌로 정리만 하면 된다.

## 토큰

### `.theme-soft-blue`가 덮는 시맨틱 토큰 (라이트)

Figma `1. Semantic Colors` 컬렉션 `Soft Blue` 모드 값을 쓴다.

- `--primary` `#3671cf`
- `--foreground` `#1f2a3d`
- `--muted-foreground` `#556173`
- `--muted` `#ffffff`
- `--border` `#e8eef8`
- `--bg-layer-2` `#f1f5fc`
- `--text-tertiary` `#b3bccb`
- `--brand-subtle` `#e6eefb`

소셜 세 화면이 실제로 참조하는 토큰만 덮는다. `--bg-guide`, `--border-strong`,
`--state-focus`는 이 화면들이 쓰지 않고 BY-717과 합의한 seam 목록에도 없어 스코프
클래스에 넣지 않는다. 전역 컷오버 때 `:root`가 전체 팔레트를 받으므로 스코프 블록에
안 쓰는 값을 둘 이유가 없다.

### 덮지 않는 토큰

`--state-distract`, `--state-distract-subtle`, `--state-distract-text`는 `.theme-soft-blue`에
넣지 않는다. Figma Soft Blue 라이트 모드의 이 값들이 어두운 다크 계열로 채워져 있어 그대로
가져오면 라이트에서 어두워진다. 덮지 않으면 `:root` V1 값을 상속해 초대코드 입력 화면의
오류 문구 색이 그대로 유지된다. PR 본문 "디자인 확인 필요"에 이 네 값을 적는다.

### 다크

`.theme-soft-blue`에 다크 조합을 얹어 `Soft Blue Dark` 모드 값으로 바꾼다. 기존 다크가 세
블록 구조라 스코프 클래스도 같은 세 갈래를 따른다.

- `@media (prefers-color-scheme: dark)`의 `:root:not([data-theme="light"]) .theme-soft-blue`
- `:root[data-theme="dark"] .theme-soft-blue`

Soft Blue Dark 값: `--primary` `#5a90ea`, `--foreground` `#eaf0f9`, `--muted-foreground`
`#9fabc0`, `--muted` `#1b2333`, `--border` `#2a3752`, `--bg-layer-2` `#232d40`,
`--brand-subtle` `#1e2a44`, `--text-tertiary` `#6b7789`, `--border-strong` `#6b7789`.

### 소셜 전용 추가 토큰

`.theme-soft-blue`와 별개 유틸로 파일 하단에 둔다. BY-717 블록과 겹치지 않는다.

- 배경 3단 그라디언트. 라이트 `#eef3fb → #f8fafd(45%) → #ffffff`, 다크
  `#172032 → #10151f(45%) → #0d1118`.
- 카드 그림자 `shadow/card-soft-blue`: `0 6px 22px rgba(63,120,218,0.08)`.
- CTA 그림자 `shadow/brand-cta`: `0 6px 18px rgba(27,100,218,0.28)`.

### 삭제 토큰

`--invite-surface`, `--invite-surface-text`, `--share-tonal`, `--share-tonal-text`는 소셜
전용 원오프였고 시안이 일반 토큰으로 흡수했다. 세 화면에서만 쓰이므로 사용처를 새 토큰으로
바꾸고 정의를 지운다.

## 컴포넌트

### Button

`components/ui/button.tsx`의 `cva`에 시안 CTA 크기와 `subtle` variant를 더한다.

- size `xl`: 높이 `56px`, 반경 `20px`. 소셜 홈 버튼과 하단 CTA에 쓴다.
- variant `subtle`: `bg-brand-subtle text-primary`. `초대코드로 참여`에 쓴다.
- CTA 그림자는 `방 만들기`·`입장하기`·`참여하기`에 className으로 얹는다.

세 화면의 원시 `<button>` 일곱 개를 `Button`으로 바꾼다. 아이콘 칩(`코드 복사`·`공유하기`)과
닫기·뒤로 아이콘 버튼도 `Button`의 `ghost`·새 chip 표현으로 흡수한다.

### 초대코드 입력

`input-otp`를 받아 `InviteCodeInput`을 다시 만든다. 값은 여전히 문자열 4자리이고 앞자리 0을
보존한다. 입력 중인 칸은 브랜드색 2px 테두리와 캐럿으로 표시한다. 칸 모양은 방 생성 완료
화면의 숫자 칸과 같게 맞춘다.

안드로이드 웹뷰에서 삽입 핸들과 캐럿이 화면에 노출되는지 실기기로 다시 본다. `input-otp`가
숨은 입력을 두는 방식이 기존 화면 밖 우회와 달라 회귀 위험이 있다.

### 코드 셀 공용

방 생성 완료와 초대코드 입력의 숫자 칸이 같은 룩이다. `68x60`, 반경 `16px`, `bg/layer-1`
바탕에 카드 그림자. 한 컴포넌트로 두 화면이 공유한다.

## 화면별 변경

### 소셜 홈

- 배경을 3단 그라디언트로.
- 제목 `24px`, 아이콘 원 `96px`에 `brand/subtle` 배경.
- 버튼 두 개를 `xl` 크기로. `방 만들기`가 남는 폭을 채우고 `초대코드로 참여`는 고정 폭.

### 방 생성 완료

- 코드 한 덩어리 카드를 숫자 네 칸으로.
- `코드 복사`·`공유하기`를 알약 칩으로, 각각 아이콘.
- 하단 `입장하기`를 `xl` 크기로.

### 초대코드 입력

- 4칸을 `input-otp` 기반으로.
- 오류 문구와 `앱에서 참여하기` 버튼은 동작을 그대로 두고 팔레트만 새로.

## 유지할 동작

- 코드는 문자열 4자리, 앞자리 0 보존.
- 네 자리 완성 시 키보드 내림, `참여하기` 활성.
- 라우팅·쿼리 승계·router state 전달·오류 매핑은 기존 그대로.
- `ScreenBackHeader`·`ToastViewport`·`Dialog`(자리비움 모달)는 재사용.

## 검증

- 세 화면 라이트·다크 스크린샷.
- `accessibility-audit`로 44px·aria·대비.
- reduced-motion에서 캐럿 깜빡임 정지.
- 안드로이드 웹뷰 입력 칸 실기기 확인.
- 소셜 밖 화면은 색이 안 바뀌었는지 확인. 스코프 클래스라 안 바뀌는 게 정상.
- 기존 테스트 통과.

## 조율

- BY-717과 `.theme-soft-blue` 클래스 이름·값을 맞춘다. 컷오버 때 한 벌로 합친다.
- BY-718 폰트 작업과는 겹치는 파일이 없다.
