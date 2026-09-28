# BY-722 세션 상태 화면 V2 설계

날짜: 2026-09-22
티켓: BY-722 (부모 BY-652), 선행 BY-717
시안: Figma V2 `S4-2 · 세션 상태 (Soft Blue)` (`node-id=5321-3660`)

## 목표

세션 상태 웹 화면 두 개를 V2 시안으로 다시 그린다. 손으로 만든 버튼, 카드, 모달, 아이콘을 저장소 shadcn 프리미티브와 lucide 아이콘으로 바꾸고, 색은 BY-717이 넣는 `.theme-soft-blue` 토큰을 소비만 한다.

대상은 `AutoEndNotice`(자동 종료 안내)와 `SessionRecoveryDialog`(세션 복구 모달)다. `SubMinuteEndNotice`는 자동 종료 안내와 레이아웃을 공유하므로 같이 고친다.

시안 첫 프레임인 카메라 권한 거부 화면은 네이티브 셸이 소유해서(ADR-0003) 웹에 없다. 범위 밖이다.

## 범위 밖

- `index.css`의 `.theme-soft-blue` 토큰 블록, `bg-softblue-grad` 유틸, `Button`의 `size="xl"`는 BY-717이 소유한다. 이 티켓은 쓰기만 하고 정의하지 않는다.
- 홈 `STAT_CARD`, 결과 `ResultCard`를 새 `Card`로 흡수하는 작업. 다른 화면을 건드리지 않기 위해 이번 범위에서 뺀다.
- 카메라 권한 거부 화면.

## BY-717이 제공하는 것 (소비 대상)

- `.theme-soft-blue` 클래스가 서브트리에서 시맨틱 변수를 재정의한다. `--primary #3671cf`, `--foreground #1f2a3d`, `--muted #ffffff`, `--border #e8eef8`, 그라디언트 스톱 `--sb-grad-*`, `--shadow-card-soft-blue`. 라이트와 다크 세 벌이 함께 있다.
- `@utility bg-softblue-grad`가 화면 배경 그라디언트를 만든다. 화면 루트에 단색 `bg-background` 대신 붙인다.
- `Button`의 `size="xl"`가 `h-14 w-full rounded-2xl px-6`다.

## 진행 순서 (2단계)

base는 dev다. BY-717이 아직 dev에 없어 색 토큰과 `size="xl"`을 쓸 수 없으므로 두 단계로 나눈다.

### 1단계 · 구조 (지금)

- 손으로 만든 요소를 shadcn 프리미티브와 lucide로 바꾼다.
- 색과 크기는 기존 토큰과 기존 `Button` 크기로 둔다. CTA는 `Button`으로 바꾸되 높이와 반경은 기존 값을 className으로 유지한다.
- 이 단계에서 빌드, 테스트, 색 검증을 마친다.

### 2단계 · 색 (BY-717이 dev에 머지된 뒤)

- dev를 병합한다.
- 화면 루트에 `bg-softblue-grad theme-soft-blue`를 붙이고, CTA를 `Button size="xl"`로 바꾸고, 카드 그림자를 `--shadow-card-soft-blue`로 바꾼다.
- 라이트와 다크 색을 시안과 대조하고 스크린샷을 남긴다.

## 새로 받는 shadcn 프리미티브

- `components/ui/card.tsx`
- `components/ui/separator.tsx`

`pnpm --filter web dlx shadcn@latest add card separator`로 받은 뒤 저장소 토큰 클래스로 고친다. 카드는 `rounded-lg border border-border bg-muted`를 기본으로 한다. 사용처는 이 두 화면으로만 한정한다.

## 화면 1 · 자동 종료 안내

`AutoEndNotice`와 `SubMinuteEndNotice`가 레이아웃을 공유한다.

- 원시 `<button>` CTA를 `Button`으로 바꾼다.
- 요약 카드 `SummaryRowCard`를 `Card`와 `Separator`로 다시 짠다. 라벨과 값 쌍은 읽기 순서가 이어지도록 `<dl>` 구조를 유지한다.
- 값 표기는 기존 `toKoreanDurationLength`를 그대로 쓴다. 값은 전부 props다.
- 아이콘 `CheckCircle`(손으로 그린 svg)을 lucide `Check`로 바꾸고 원형 배경은 유지한다.
- 자동 종료는 사용자가 유발하지 않은 상태 변화라 기존 `aria-live="polite"`를 유지한다.

## 화면 2 · 세션 복구 모달

`SessionRecoveryDialog`.

- 손으로 만든 `<div role="dialog">`와 백드롭을 `components/ui/dialog.tsx`의 `Dialog`, `DialogContent`로 바꾼다.
- 바깥 클릭과 esc로는 닫히지 않게 `onInteractOutside`와 `onEscapeKeyDown`에서 기본 동작을 막는다. `확인` 버튼으로만 닫는다.
- 포커스 이동은 Radix에 맡긴다. 기존 `autoFocus`가 하던 일을 `DialogContent`의 초기 포커스로 옮긴다.
- 정보 행 `InfoRow`를 `Card`와 `Separator`로 바꾼다. 날짜, 시작·종료, 총 공부시간, 순공시간 네 행을 유지하고 순공시간만 강조색을 쓴다.
- 아이콘 `IconRecovery`(손으로 그린 svg)를 lucide `History`로 바꾼다.
- 날짜와 시간 표기는 기존 `recordsFormat`의 함수들을 그대로 쓴다.

## 접근성과 모션

- 누를 수 있는 요소는 모두 44px 이상이다.
- 모션 축소 환경에서 전환 애니메이션이 빠진다. 복구 모달의 열림 애니메이션도 `motion-reduce`로 끈다.
- 글자 대비는 WCAG AA를 넘는다.
- 색만으로 의미를 전달하지 않는다.

## 테스트

기존 테스트를 새 구조에 맞춘다. 상태, aria, 텍스트로 단언하고 클래스 문자열은 단언하지 않는다.

- `SessionRecoveryDialog.test.tsx`
- `RoomPage.autoEnd.test.tsx`
- `sessionCopy.test.ts`
- `useLaunchSessionRecovery.test.tsx`

새로 추가할 케이스는 복구 모달이 바깥 클릭과 esc로는 닫히지 않고 `확인`으로만 닫히는 동작이다.

## 완료 조건

- 두 화면이 라이트와 다크에서 시안과 같은 색, 간격, 반경, 그림자로 보인다.
- CTA, 모달, 카드, 아이콘이 모두 `components/ui`의 shadcn 프리미티브와 lucide 아이콘을 쓴다.
- 복구 모달이 Radix `Dialog`로 열리고 바깥 클릭과 esc로는 닫히지 않는다.
- 자동 종료 안내와 1분 미만 종료 안내가 같은 새 레이아웃을 쓴다.
- 순공시간과 총 공부 값이 props 그대로 한글 시간 길이로 표기된다.
- 누를 수 있는 요소가 모두 44px 이상이고 모션 축소가 지켜진다.
- 라이트와 다크 스크린샷을 화면당 한 장씩 남긴다.
- 위 네 테스트가 통과한다.

## 확인이 필요한 부분

- 요약 카드 구분선은 시안 하드코딩 값에 다크 대응이 없어 기존대로 `border/default` 토큰을 쓴다. 라이트 3계조 차이는 PR의 디자인 확인 목록에 남긴다.
