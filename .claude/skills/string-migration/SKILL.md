---
name: string-migration
description: "FocusMakers 웹 화면의 한국어 문구를 i18n 카탈로그로 빼는 방법. 네임스페이스·키 이름 규칙, useTranslation·Trans 쓰는 법, 복수형, 날짜 헬퍼를 intl.ts로 바꾸는 법, 문구 상수 파일 삭제, 테스트 처리, 번역하지 않는 한글, 린트 적용 범위 확장, 영어 표기 규칙(references/en-style.md). string-migrator와 en-copywriter가 BY-809·810에서 읽는다. 화면 문구 추출, 하드코딩 한글 제거, t() 적용, 영어 카탈로그 작성, 영어 용어 통일 작업이면 이 스킬을 읽을 것. i18n 런타임 설정 자체는 i18n-foundation 스킬이다."
---

# String Migration

## 한 파일을 바꾸는 순서

1. 파일의 한글을 전부 찾는다(주석 제외). 각 문구가 사용자에게 보이는지 정한다. 아래 "번역하지 않는 것" 표에 해당하면 건너뛴다.
2. 네임스페이스 JSON에 키를 더한다. 같은 네임스페이스에 같은 문구가 이미 있고 같은 자리에서 같은 뜻이면 키를 재사용한다. 뜻이 다르면 문구가 같아도 키를 따로 둔다(영어에서 갈라질 수 있다).
3. 코드에서 `t()`로 바꾼다.
4. 같은 폴더 테스트를 돌려 한국어 출력이 그대로인지 본다.

## 키 이름

- 형식은 `<화면 또는 컴포넌트>.<요소>.<역할>`이고 camelCase다. 예: `weekTrend.title`, `periodPicker.apply`, `sessionItem.aria.open`.
- 문구 자체를 키로 쓰지 않는다. 번호를 붙이지 않는다(`text1` 금지).
- aria-label은 `.aria.` 아래에 둔다. QA가 접근성 문구를 따로 세기 쉽다.
- 깊이는 3단계까지만 둔다.

## 코드에서 쓰는 법

```tsx
const { t } = useTranslation("records");
<h2>{t("weekTrend.title")}</h2>
<button aria-label={t("sessionItem.aria.open", { subject })}>
```

- 컴포넌트 밖(모듈 상수, 순수 함수)에서는 `i18n.t("records:weekTrend.title")`를 호출 시점에 부른다. 모듈 최상위 상수에 `t()` 결과를 담지 않는다. 담으면 import 시점 언어로 고정된다.
- 문구 상수 객체(`sessionCopy.ts` 같은 것)는 키를 돌려주는 함수나 호출부 `t()`로 바꾸고 파일을 삭제한다.
- 문장 안에 `<strong>`이나 링크가 있으면 `<Trans i18nKey="..." components={{ b: <strong /> }} />`를 쓰고, JSON에는 `<b>...</b>`로 둔다.
- 한국어 조사가 변수에 따라 바뀌는 곳(`을/를`)은 지금 코드가 어떻게 처리하는지 보고 그대로 유지한다. 새 조사 처리 헬퍼를 만들지 않는다.

## 복수형과 숫자

- ko JSON에는 접미 없는 키 하나만 둔다: `"sessions": "공부 {{count}}회"`.
- en은 `en-copywriter`가 `sessions_one`·`sessions_other`를 만든다. 문구 추출 담당은 en에 ko와 같은 접미 없는 키를 자리 표시로 둔다. 복수형이 필요한 키는 보고서 "영어 담당에게" 절에 표시한다.
- `count` 변수 이름은 꼭 `count`로 쓴다. i18next가 복수형을 고르는 이름이다.

## 날짜·시간

- 지금 헬퍼(`recordsFormat.ts` 등)가 한국어 단위를 손으로 붙이면 `lib/intl.ts` 함수나 `common` 단위 키로 바꾼다. 함수 이름·인자는 기반 보고서 "사용법" 절에 있다.
- ko 출력이 바뀌면 안 된다. 기존 테스트가 기준이다. `Intl` 출력이 기존 ko 표기와 다르면 카탈로그 키로 만든다.
- KST 날짜 키(`todayKstDateKey`)와 `STAT_TIME_ZONE`은 건드리지 않는다. 시간대 전환은 BY-815다.

## 번역하지 않는 것

| 대상 | 처리 |
|---|---|
| `throw new Error("…")`, `console.*`, Sentry 메시지 | 영어로 바꾼다. 테스트가 그 메시지를 단언하면 테스트도 고친다 |
| Amplitude 이벤트 이름·속성 값 | 그대로 둔다. 바꾸면 지표가 끊긴다. 린트 예외는 그 파일 블록이 아니라 해당 줄 `// eslint-disable-next-line no-restricted-syntax -- 분석 이벤트 값`으로 둔다 |
| 서버로 보내는 값(과목 기본 이름 등 서버가 저장하는 문자열) | 그대로 둔다. 화면에 보일 때만 카탈로그로 바꾼다. 판단이 어려우면 보고서에 적는다 |
| 개발용 화면, 테스트 픽스처(`rankingFixtures.ts`, `rankingMock.ts`) | 그대로 둔다. 이 파일이 든 폴더를 `I18N_ENFORCED`에 넣을 때 린트 블록의 `ignores`에 함께 더한다 |
| 약관·개인정보처리방침 본문(`legalDocuments.ts`) | 그대로 둔다(BY-1117). 영어 UI의 안내 한 줄만 `settings` 키로 만든다 |
| 정규식·비교용 한글(입력 검증 등) | 그대로 두고 줄 단위 예외 주석에 이유를 적는다 |

## 테스트

- 기존 테스트의 한국어 단언은 고치지 않는다. 테스트 환경이 ko로 초기화돼 있어 그대로 통과해야 한다.
- 문구 상수를 import하던 테스트는 상수 대신 리터럴 한국어나 `i18n.t()` 결과를 단언하게 바꾼다.
- 묶음마다 대표 화면 하나에 영어 렌더 테스트를 더한다. `i18n.changeLanguage("en")` 뒤 렌더하고 `/[가-힣]/`이 화면 텍스트에 없는지 본다. `afterEach`에서 `ko`로 되돌린다. 이 테스트는 en 값이 채워진 뒤에 통과하므로, 문구 추출 담당은 테스트만 만들어 두고 실패를 보고서에 적는다. 영어 담당이 끝낸 뒤 QA가 통과를 확인한다.

## 린트 적용 범위

- 묶음이 병렬로 돌 때는 `eslint.config.mjs`와 `src/i18next.d.ts`를 고치지 않는다. 두 파일은 리더가 맡는다. 더할 줄을 보고서 "리더에게" 절에 적는다.
- 확인은 규칙을 임시로 켠 설정 없이도 할 수 있다: `pnpm --filter web exec eslint --rule '{"no-restricted-syntax":["error",{"selector":"Literal[value=/[가-힣]/]"},{"selector":"TemplateElement[value.raw=/[가-힣]/]"},{"selector":"JSXText[value=/[가-힣]/]"}]}' <폴더>`가 남긴 한글만 보여야 한다.

## 영어 표기

영어 담당은 `references/en-style.md`를 읽고 갱신한다. 문구 추출 담당은 읽지 않아도 된다.
