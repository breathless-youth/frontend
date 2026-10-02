# 0011. 프로필 폼을 react-hook-form과 zod로 만든다

- Status: Accepted
- Date: 2026-09-30
- Relates to: [프로필 폼 전환 설계](../superpowers/specs/2026-09-30-by-649-profile-form-rhf-zod-design.md), `apps/web/src/routes/ProfilePage.tsx`, `apps/web/src/features/profile/profileSchema.ts`

## 배경

프로필 화면은 입력값과 오류를 필드마다 `useState`로 들고, 저장 버튼을 누를 때 검증 함수를 하나씩 불러 결과를 모았다. 화면이 `<form>`으로 감싸여 있지 않아 입력칸에서 엔터를 쳐도 저장되지 않았고, 검증 시점과 오류 표시도 필드마다 손으로 맞춰야 했다. 앞으로 폼이 더 늘어날 예정이라 이대로면 같은 코드를 화면마다 다시 써야 했다. 그래서 프로필 화면을 첫 사례로 삼아 폼 상태와 검증 방식을 정했다.

## 결정

폼 상태는 `react-hook-form`이 관리하고, 검증은 `zod` 스키마를 `@hookform/resolvers`의 `zodResolver`로 연결했다.

- 필드는 shadcn 현행 react-hook-form 가이드의 `Controller` + `Field` 패턴으로 그린다.
- shadcn의 예전 `form.tsx`는 지금 가이드가 더 이상 쓰지 않아 들이지 않았다.
- 검증 규칙은 `profileValidation.ts`의 일반 함수에 그대로 두고, `makeProfileSchema`가 그 함수를 불러 결과를 `ctx.addIssue`로 싣는다.
- 규칙을 zod 문법으로 다시 쓰지 않아 기준과 문구가 한 곳에만 있다.
- 각 필드는 저장된 값에서 바뀌었을 때만 검사해, 지금 규칙보다 먼저 만든 닉네임이나 20자를 넘는 옛 목표를 그대로 둔 채 다른 필드만 고치는 저장을 막지 않는다.
- 첫 오류는 `mode: "onBlur"`로 입력칸을 떠날 때 띄워, 타이핑 중인 미완성 값에 오류가 계속 깜빡이지 않게 했다.
- 이미 뜬 오류는 그 칸의 `onChange`에서 `trigger`로 다시 검사해 고치는 순간 지운다.

## 검토한 대안

- **지금처럼 `useState`와 수동 검증 유지**: 새 의존성은 없지만 폼이 늘 때마다 상태, 검증 시점, 오류 표시 코드를 화면마다 다시 써야 한다.
- **TanStack Form**: shadcn 가이드가 함께 안내하는 선택지라 비교했다. zod를 어댑터 없이 받고 이미 쓰는 TanStack Query와 같은 계열이라는 장점이 있었다. 하지만 이번 폼에서 필요한 검증 시점 제어는 두 라이브러리 모두 직접 조건을 짜야 했고, 번들은 이번 사용 범위 기준으로 17.7KB로 react-hook-form과 resolvers를 합친 13.8KB보다 컸다. 1.0이 2025년 3월에 나와 자료도 react-hook-form보다 적다. 동적 배열, 디바운스가 필요한 비동기 검증, 여러 화면이 공유하는 폼 부품이 필요해지면 다시 검토한다.
- **shadcn의 예전 `form.tsx`**: 티켓이 처음 제안한 방식이었지만 shadcn 가이드가 `Field` 컴포넌트로 바뀌어, 새로 들이면 처음부터 낡은 패턴이 된다.

## 결과와 제약

- `App.tsx`가 프로필 화면을 바로 import해 `react-hook-form`과 `zod`가 첫 번들에 들어갔고, 라우트 단위 코드 분할은 후속 작업으로 남겼다.
- 화면이 `<form>`이 되면서 Amplitude autocapture의 `formInteractions`가 이 화면의 폼 시작·제출 이벤트를 수집하기 시작했다.
- 입력칸에서 엔터를 치면 저장된다.
- 닉네임 길이는 `nicknameMaxLength`가 보이는 글자 12자에 닿은 순간에만 지금 길이로 `maxLength`를 거는 방식으로 막았다.
- 조합이 끝나는 순간 JS로 값을 잘라 고쳐 쓰면 iOS 한글 키보드의 버퍼와 입력칸 값이 어긋나, 잘려 나간 글자가 백스페이스를 누를 때마다 하나씩 되살아났다.
- `maxLength`를 늘 걸어 두지 않은 것은 UTF-16 코드 단위로 세는 `maxLength`가 `🧑‍💻`처럼 여러 칸을 차지하는 이모지 닉네임을 서버 한도보다 먼저 막기 때문이다.
- 붙여넣기처럼 한 번에 여러 글자가 들어오는 경우는 조합 중이 아닐 때 `clampNickname`이 12자로 자른다.
