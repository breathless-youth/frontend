# BY-1025 한글 입력칸 글자 수 한도 설계

## 문제

프로필 닉네임(12자)과 목표 문구(20자) 칸에서 한도를 넘겨 계속 치면 마지막 글자가 친 글자로 바뀌었다. 그 상태로 백스페이스를 누르면 멀쩡하던 앞 글자까지 넘쳐서 친 글자로 덮어써졌다.

## 원인

iOS 27 한글 자판은 조합 중인 글자를 "끝 글자 삭제 → 합친 글자 넣기"로 입력칸에 보내고, `compositionstart`·`compositionend`를 보내지 않는다. 입력칸이 한도에서 글자를 버리면(`maxLength`든 JS 자르기든) 자판은 그 글자를 자기 버퍼에 남겨 둔다. 이후 자판이 보내는 "끝 글자 삭제"가 입력칸의 실제 끝 글자를 지워 앞 글자가 덮어써졌다.

iPhone 13 mini(iOS 27)에서 입력 이벤트를 기록해 확인했다. 백스페이스 뒤 다시 들어온 글자가 방금 삭제한 글자를 풀어 쓴 모양이 아니면 덮어쓰기로 셌다.

| 조건      | 목표 문구   | 닉네임      |
| --------- | ----------- | ----------- |
| 한도 있음 | 34회 중 5회 | 18회 중 2회 |
| 한도 없음 | 52회 중 0회 | 40회 중 0회 |

원인 설명 페이지: https://claude.ai/artifact/6ZEfPtJxn71oM6azUiUUyV

## 결정

입력칸이 글자를 버리지 않게 하고, 한도는 글자 수 표시와 저장 막기로 지킨다. 2026-10-28 사용자 승인.

| #   | 항목             | 결정                                                                                                                                                                              |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 범위             | 한글이 들어오는 `maxLength` 칸 11곳 전부. 초대 코드(숫자 4자리)는 제외한다.                                                                                                       |
| 2   | 입력 제한        | `maxLength`와 JS 자르기를 모두 없앤다. 한도를 넘어도 입력은 받는다.                                                                                                               |
| 3   | 글자 수 표시     | `n/한도`. 프로필 2칸과 D-Day 제목은 항상, 과목·할 일 이름 칸은 한도의 80% 이상일 때만(과목 10자, 할 일 12자부터) 보인다.                                                          |
| 4   | 한도 초과        | 숫자를 `state-distract-text` 색으로 바꾸고 안내 문구를 보인다. 저장·확정 버튼은 비활성이다.                                                                                       |
| 5   | 닉네임 세기      | 앞뒤 공백을 뺀 보이는 글자(grapheme) 기준. 서버와 같다.                                                                                                                           |
| 6   | Figma            | V2 시안에 글자 수 표시와 초과 상태를 추가한다.                                                                                                                                    |
| 7   | 인라인 입력 이탈 | 한도를 넘은 상태면 Enter·`완료`·포커스 이탈 모두 확정하지 않고 입력을 연 채 둔다. 다른 줄을 눌러 입력기가 닫히면 지금처럼 취소된다.                                               |
| 8   | 과목·할 일 한도  | 과목 이름 12자, 할 일 15자로 줄인다. 2026-10-28 사용자 지시. 서버 한도보다 짧아 서버와 충돌하지 않는다. 이미 더 긴 이름은 그대로 보이고, 수정할 때만 한도 안으로 줄여야 저장된다. |

## 대상

| 화면                                    | 칸                       | 한도   | 세는 기준                              |
| --------------------------------------- | ------------------------ | ------ | -------------------------------------- |
| 프로필 `ProfilePage`                    | 닉네임                   | 12     | `countGraphemes(normalizeNickname(v))` |
| 프로필 `ProfilePage`                    | 목표 문구                | 20     | `v.length` (`validateGoal`과 같다)     |
| 홈 `DdaySheet`                          | D-Day 제목               | 15     | `v.length` (기존 표시와 같다)          |
| 플래너 `PlannerSubjects` `InlineEditor` | 과목 이름 2곳, 할 일 2곳 | 12, 15 | `v.length`                             |
| 세션 `SubjectPanel` `InlineNameEditor`  | 과목 이름 2곳, 할 일 2곳 | 12, 15 | `v.length`                             |

과목 이름·할 일·D-Day 제목 칸은 지금까지 `maxLength`가 UTF-16 코드 단위로 막았으므로 같은 기준을 유지한다.

## 구성

### `CharCount` (`components/ui/char-count.tsx`)

글자 수 표시 한 줄. 입력칸 아래 오른쪽에 놓인다.

- props: `id`, `length`, `max`, `showFrom?`(0~1, 기본 0), `overMessage`, `className?`
- `length < max * showFrom`이면 아무것도 그리지 않는다.
- 한도 이하: `n/max`를 `text-text-tertiary`, `tabular-nums`로 그린다.
- 한도 초과: 왼쪽에 `overMessage`를 `role="alert"`로, 오른쪽에 `n/max`를 `text-state-distract-text`로 그린다. 문구는 초과 상태로 들어갈 때 한 번 읽힌다.
- 입력칸은 `aria-describedby`로 `id`를 가리킨다.

프로필은 초과 문구를 기존 `FieldError`(스키마 오류)가 맡으므로 `CharCount`에 `overMessage`를 넘기지 않는다. 문구가 두 번 나오지 않게 하기 위해서다.

### 공용 로직 `useInlineNameEdit` (`subjectInteractions.ts`)

- 인자에 `maxLength: number`를 더한다.
- 반환에 `over: boolean`(`value.length > maxLength`)을 더한다.
- `commit()`은 `over`면 아무것도 하지 않고 돌아간다. `doneRef`를 세우지 않으므로 한도 안으로 줄이면 다시 확정할 수 있다.
- Escape 취소는 그대로 동작한다.

### `InlineEditor`·`InlineNameEditor`

- `maxLength` 속성을 없애고 훅에 넘긴다.
- `완료` 버튼은 `disabled={over}`.
- 줄 아래에 `CharCount`(`showFrom` 0.8, `overMessage` `${max}자까지 쓸 수 있어요`)를 둔다. 세션 패널은 어두운 배경이라 색을 `text-white/50`, 초과 시 `text-state-distract-text`로 맞춘다.

### `DdaySheet`

- `maxLength`를 없앤다.
- 기존 `title.length/15` 표시를 초과 시 빨간색으로 바꾸고, 입력 줄 아래에 `15자까지 쓸 수 있어요`를 보인다.
- `canSave`에 `title.length <= DDAY_TITLE_MAX_LENGTH`를 더한다. Enter의 `submit()`도 `canSave`를 거치므로 따로 막지 않는다.

### `ProfilePage`

- 닉네임: `maxLength`, `clampNickname`, `composingRef`, `onCompositionStart`·`onCompositionEnd`를 없앤다. `onChange`는 값을 그대로 넘긴다.
- `profileValidation.ts`에서 `clampNickname`·`nicknameMaxLength`와 그 테스트를 없앤다.
- 목표: `maxLength={20}`과 그 주석을 없앤다.
- 두 칸 아래에 `CharCount`(항상 표시)를 둔다.
- 한도를 넘는 순간 해당 필드 `trigger`를 불러 기존 오류 문구를 바로 보인다. 첫 오류를 blur에서만 띄우던 규칙은 한도 초과에만 예외로 둔다.
- 저장 버튼: `disabled={!isDirty || overLimit || saveMutation.isPending}`.

## 테스트

jsdom은 iOS 자판의 조합 방식을 재현하지 못한다. 단위 테스트는 "입력을 버리지 않는다"와 "넘치면 저장되지 않는다"만 확인하고, 덮어쓰기가 사라졌는지는 실기기 기록으로 확인한다.

- `useInlineNameEdit`: 한도를 넘으면 `commit`이 `onCommit`·`onCancel` 모두 부르지 않는다. 한도 안으로 줄이면 다시 확정된다.
- `SubjectPanel`·플래너 인라인 입력: 입력에 `maxLength` 속성이 없다. 과목 이름 13자나 할 일 16자를 넣으면 `완료`가 비활성이고 Enter·blur로 저장되지 않는다. 할 일은 11자까지 글자 수가 보이지 않고 12자부터 보인다.
- `DdaySheet`: 16자 입력이 그대로 남고 저장이 비활성이며 안내 문구가 보인다.
- `ProfilePage`: 두 입력에 `maxLength`가 없다. 21자 목표를 입력하면 값이 그대로 남고 `21/20`과 오류 문구가 보이며 저장이 비활성이다. 이모지 닉네임은 보이는 글자 기준으로 센다.
- 실기기: iPhone에서 프로필 두 칸에 한도를 넘겨 치고 백스페이스를 누르는 기록을 다시 남겨, 덮어쓰기 0회를 확인한다.

## 범위 밖

- 초대 코드 입력(숫자 4자리, 한글 없음).
- 서버 검증 규칙과 한도 숫자. 위키(`BY-404-그룹.md`, `voice-tone.md`)에 입력을 막는다는 정책이 없어 위키는 수정하지 않는다.
