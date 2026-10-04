# BY-649 프로필 폼 react-hook-form + zod 전환 설계

## 목표

프로필 화면(`ProfilePage.tsx`)의 폼 상태와 검증을 `react-hook-form`과 `zod`로 옮긴다. 앞으로 늘어날 폼의 기반을 까는 첫 사례다. 구조 전환과 함께 티켓의 `변경해야 하는 기존 결정` 두 가지를 반영한다.

- 입력칸 길이 한도에서 더 이상 입력되지 않게 막는다(2026-08-25의 "막지 않고 안내" 결정을 뒤집는다).
- 닉네임 형식·최소 길이 검증을 저장 시점에서 blur 시점으로 앞당긴다.

## 확정한 결정

| #   | 항목              | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 폼 프리미티브     | shadcn 현행 react-hook-form 가이드의 `Controller` + `Field` 패턴. 티켓의 `form.tsx`(`FormField`·`FormItem`)는 가이드가 더 이상 쓰지 않아 들이지 않는다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | zod 버전          | v4 (`zod` 4.6). `@hookform/resolvers` 5.9가 `^3.25 \|\| ^4`를 지원한다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | `label.tsx`       | shadcn 원본을 쓰되 저장소 관례대로 개별 패키지 `@radix-ui/react-label`을 import한다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4   | 오류 문구         | `FieldError`로 렌더하되 지금의 `id`(`profile-nickname-error` 등), `role="alert"`, `text-sm text-state-distract-text`를 유지한다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5   | 엔터 키           | `<form>` 전환에 따라 입력칸 엔터로 저장된다. 버튼이 잠긴 상태면 제출되지 않는다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | 길이 한도         | 목표는 `maxLength={20}`. `validateGoal`과 같은 UTF-16 코드 단위 기준이다. 닉네임은 보이는 글자(그래핌) 12자에 닿은 순간에만 `maxLength`를 지금 UTF-16 길이로 건다(`nicknameMaxLength`). 12자 미만에서는 걸지 않는다. 코드 단위로 세는 `maxLength`를 늘 걸면 `🧑‍💻`(5칸) 같은 서버 허용 이모지 닉네임을 먼저 막기 때문이다. 12자부터는 브라우저가 입력을 막아야 키보드가 조합 중인 글자와 입력칸 값이 어긋나지 않고, 가운데 끼워 넣을 때 커서도 끝으로 튀지 않는다. JS로 12자까지 자르는 `clampNickname`은 조합 중이 아닐 때의 `onChange`에서만 돈다. 붙여넣기처럼 12자 미만에서 여러 글자가 한꺼번에 들어오는 경우를 위한 안전망이다. `compositionend`에서는 값을 고쳐 쓰지 않는다. 조합이 끝나는 순간 값을 고쳐 쓰면 iOS 한글 키보드의 버퍼와 입력칸 값이 어긋나, 잘려 나갔던 글자가 백스페이스를 누를 때마다 하나씩 되살아났다. 조합으로 12자를 넘긴 값은 그대로 두고 blur·저장 때 스키마가 `NICKNAME_RULE_MESSAGE`로 거부한다. 조합 여부는 `compositionstart`·`compositionend`로 ref에 기록해 판단한다 |
| 7   | 검증 시점         | `mode: "onBlur"`, `reValidateMode: "onBlur"`. 첫 오류는 blur에서 띄운다. 오류가 떠 있는 칸만 `onChange`에서 `trigger`로 다시 검사해 고치는 순간 지운다. 저장이 한 번 실패한 뒤에도 입력 중인 미완성 값에는 오류를 띄우지 않는다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8   | 실시간 길이 안내  | `닉네임은 12자까지…`, `목표는 20자까지…` 입력 중 안내를 지운다. 입력이 막혀 뜰 일이 없다. 길이 초과는 스키마가 계속 거부한다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | 저장 성공 후 동작 | 설정 화면으로 돌아가지 않고 프로필 화면에 머문다(2026-08-25 "저장=완료" 복귀 결정을 뒤집는다). "프로필이 저장됐어요" 토스트를 이 화면에서 바로 띄우고, 포커스를 풀어 키보드를 내린다. 토스트는 저장 버튼을 감싼 `relative` 영역 안에 둔 `CtaToaster`로 버튼 위 12px에 띄운다. 초대코드 공유·룸 화면과 같은 방식이라 버튼 크기나 안전영역이 바뀌어도 위치가 따라간다. 복귀 뒤 설정 화면이 토스트를 띄우던 `profileSavedNotice` 전달 경로와 설정 화면의 지연 토스트는 지운다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 새 의존성 (`apps/web`)

- `react-hook-form` ^7.89
- `zod` ^4.6
- `@hookform/resolvers` ^5.9
- `@radix-ui/react-label`

## 구성 요소

### `components/ui/label.tsx`, `components/ui/field.tsx`

`label.tsx`는 shadcn new-york-v4 원본에서 import 경로만 저장소에 맞춘다(`@/lib/utils`의 `cn`, `@radix-ui/react-label`). `field.tsx`는 이 화면이 쓰는 `Field`(세로 배치)·`FieldLabel`·`FieldError`만 옮긴다. `separator.tsx`처럼 쓰는 만큼만 들이는 저장소 관례를 따른 것이고, 저장소에 `destructive` 토큰이 없어 오류 색은 `text-state-distract-text`로 바꾼다. 색·간격은 프로필 화면이 쓰던 클래스를 호출부에서 넘겨 지금 룩을 유지한다.

### `features/profile/profileSchema.ts`

```ts
export function makeProfileSchema(original: {
  nickname: string;
  goal: string | null;
  category: string | null;
});
```

- 필드는 `nickname: string`, `goal: string`, `category: string | null`.
- 닉네임은 `normalizeNickname(value) !== original.nickname`일 때만 `validateNickname`을 돌린다. BY-646 이전 규칙으로 만든 닉네임을 그대로 둔 채 목표만 고친 저장이 계속 통과해야 해서다. blur 검증에도 같은 규칙이 적용된다.
- 목표는 빈 문자열을 `null`로 바꾼 값이 `original.goal`과 다를 때만 `validateGoal`로 본다. 20자를 넘는 옛 목표를 그대로 둔 채 다른 필드만 고친 저장을 막지 않기 위해서다.
- 카테고리는 원래 값과 다를 때만 `CATEGORY_CHIPS` 값 또는 `null`인지 본다. 칩 목록에 없는 옛 값을 가진 사용자의 다른 필드 저장을 막지 않기 위해서다.
- 문구는 기존 검증 함수가 돌려주는 문자열을 `ctx.addIssue`로 그대로 싣는다. 규칙의 원천은 `profileValidation.ts` 하나로 남는다.

### `features/profile/profileValidation.ts`

- `validateNicknameLength`는 호출처가 사라지므로 지운다.
- 닉네임을 그래핌 12자로 자르는 `clampNickname(value)`를 더한다. `Intl.Segmenter`가 없으면 자르지 않는다(기존 검증 함수들과 같은 폴백 이유).
- 닉네임 입력칸의 `maxLength`를 정하는 `nicknameMaxLength(value)`를 더한다. 정규화한 값이 그래핌 12자 이상이면 `value.length`를, 아니면 `undefined`를 돌려준다. `Intl.Segmenter`가 없으면 늘 `undefined`다.

### `routes/ProfilePage.tsx`

- `useForm({ resolver: zodResolver(schema), mode: "onBlur", reValidateMode: "onBlur" })`. 오류가 떠 있는 칸은 `onChange`에서 `trigger`로 다시 검사한다.
- 닉네임 입력칸은 `maxLength={nicknameMaxLength(field.value)}`. `onChange`는 조합 중이 아닐 때만 `clampNickname`을 거친 값을 넘기고, `compositionend`는 조합 표시만 되돌린다.
- 폼은 `ProfileForm`으로 분리해 서버 프로필이 도착한 뒤에만 마운트한다. 스키마는 그 프로필로 `useMemo`에서 만들고, 초기값은 `defaultValues`로 넣는다. `reset`은 쓰지 않으므로 재조회가 편집 중 값을 덮지 않는다(기존 동작 유지).
- 저장 버튼 잠금은 `!isDirty || isPending`. 형식 오류로는 잠그지 않고, 누르면 `handleSubmit`이 오류를 띄운다(지금과 같다).
- 아바타 이니셜은 `useWatch`로 읽은 닉네임에서 즉시 파생한다.
- 서버 409 → `setError("nickname", 중복 문구)`, 400 → `setError("nickname", NICKNAME_RULE_MESSAGE)`, 그 밖 → `setError("root", "잠시 후 다시 시도해 주세요")`.
- 변경 필드만 담는 `patch` 계산, `trackProfileSaveSubmitted`(검증 통과 직후)와 `trackProfileSaveResult`(mutation 결과) 호출 시점은 그대로 둔다.
- 저장 성공 시 캐시를 응답으로 갱신하고 `showCtaToast("프로필이 저장됐어요")`를 부른 뒤 포커스된 요소를 `blur()`한다. 화면 이동은 없다. 갱신된 캐시가 `profile`로 내려와 `buildPatch`가 비므로 저장 버튼이 다시 잠긴다. 폼 `reset`은 필요 없다.
- 저장 버튼은 `type="submit"`, 화면을 `<form noValidate onSubmit={handleSubmit(onValid)}>`로 감싼다. 카테고리 `ToggleGroup`은 `Controller`로 연결하고 빈 문자열 → `null` 변환을 유지한다.

## 테스트

### 기대값이 바뀌는 기존 케이스 (`ProfilePage.test.tsx`)

- "목표 문구가 20자를 넘으면 입력 중에 인라인 안내가 뜨고 저장이 막힌다" → 목표 입력칸에 `maxlength="20"`이 있다.
- "닉네임이 12자를 넘으면 입력 중에 인라인 안내가 뜨고 저장이 잠긴다" → 13자를 입력하면 12자만 남고, 이모지 12자는 잘리지 않는다.
- "실시간 안내는 형식·최소 길이를 보지 않는다" → 입력 중에는 안내가 없고, blur하면 형식 안내가 뜬다.
- 설정 화면 복귀를 보던 저장 성공 케이스 3건 → 저장 성공 뒤에도 프로필 화면이 남아 있고, 화면의 `CtaToaster`에 저장 완료 토스트가 뜨고, 저장 버튼이 다시 잠긴다(일반·이모지 닉네임 두 경우). 저장 성공 시 입력칸 포커스가 풀린다.
- `settingsPage.test.tsx`의 "프로필 저장 완료 토스트" 묶음은 기능과 함께 지운다.

### 새 케이스

- 한글 조합으로 13자가 된 값은 조합 중에도 조합이 끝난 뒤에도 그대로 남고, blur하면 형식 안내가 뜬다.
- 닉네임이 11자면 `maxlength`가 없고 12자면 `maxlength="12"`가 걸리며, 빈 칸에 14자를 타이핑하면 12자만 남는다.
- `profileValidation.test.ts`: `nicknameMaxLength`는 11자에 `undefined`, 12자에 UTF-16 길이(`"가".repeat(12)` → 12, `"🧑‍💻".repeat(12)` → 그 `.length`), 서버가 지우는 앞 공백은 세지 않는다. `Intl.Segmenter`가 없으면 `undefined`다.
- blur 오류가 뜬 닉네임을 올바르게 고치면 입력 중에 오류가 사라진다.
- 닉네임을 바꾸지 않았으면 blur해도 오류가 없다.
- 입력칸에서 엔터를 치면 저장된다.
- 저장이 한 번 실패한 뒤에도 닉네임 형식 안내는 입력 중이 아니라 blur에서 뜬다.
- `profileSchema.test.ts`: 닉네임 미변경 시 규칙 위반 닉네임 통과, 변경 시 거부, 목표 21자 거부, 목표 빈 값 허용, 20자를 넘는 옛 목표는 미변경 시 통과·변경 시 거부, 카테고리 미변경 시 목록 밖 값 통과, 변경 시 거부.

나머지 기존 케이스(변경 필드만 PATCH, 공백 정규화, 409·400 인라인, 이니셜 파생 등)는 기대값 수정 없이 통과한다. `pnpm --filter web test`, `typecheck`, `lint`를 통과한다.

## 범위 밖

프로필 외 폼 전환, 검증 규칙·문구 변경, 디자인 변경, shadcn 프리미티브 전면 도입, 서버 오류 명세 변경.
