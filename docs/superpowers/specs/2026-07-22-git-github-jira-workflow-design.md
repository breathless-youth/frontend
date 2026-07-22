# Git, GitHub, and Jira Workflow Design

## 목적

FocusOn 팀의 모든 개발 작업을 Jira 티켓에서 시작하고, Git 브랜치·커밋·GitHub Pull Request·리뷰·병합 결과를 Jira 티켓까지 추적할 수 있게 한다. Jira를 작업의 단일원천으로 사용하며 저장소 자동 검사와 GitHub Ruleset으로 팀 규칙을 강제한다.

## 시스템별 책임

- Jira: 작업 범위, 담당자, 상태, 완료 조건, 의존성과 우선순위의 단일원천
- Git: 티켓별 변경 이력과 격리된 작업 공간
- GitHub: Pull Request, 코드 리뷰, CI와 병합 통제
- 저장소 문서: 어떤 AI 또는 개발자도 동일하게 따르는 실행 규칙

GitHub Issue는 개발 작업 원천으로 사용하지 않는다. PR과 브랜치는 Jira 키를 추적 식별자로 사용한다.

## 확인된 연동 대상

- GitHub 저장소: `breathless-youth/frontend`
- Jira 사이트: `https://breathless-youth.atlassian.net`
- Jira 프로젝트: `SCRUM`
- Jira Cloud ID: `5a4a3f92-f903-413f-ab27-3387d26d67a4`

Jira API는 현재 사용자에게 읽기·쓰기 권한이 있다. GitHub CLI는 아직 인증되지 않았으므로 Ruleset을 실제 적용하기 전에 `gh auth login`이 필요하다.

## 브랜치 모델

### `main`

- 언제든 배포할 수 있는 안정 버전을 유지한다.
- 직접 push를 금지한다.
- `dev`에서 생성된 Pull Request만 병합한다.
- 필수 CI와 리뷰가 통과해야 병합할 수 있다.

### `dev`

- 개발 통합 브랜치다.
- 일반 기능과 수정 Pull Request의 기본 대상이다.
- 직접 push를 금지하고 Pull Request를 통해서만 변경한다.

### 작업 브랜치

```text
feature/{JIRA-KEY}-{domain}-{detail}
fix/{JIRA-KEY}-{domain}-{detail}
```

예시:

```text
feature/SCRUM-170-profile-screen
feature/SCRUM-204-home-study-summary
fix/SCRUM-152-auth-token-refresh
```

규칙:

- Jira 키는 대문자 프로젝트 키와 숫자를 사용한다.
- Jira 프로젝트는 현재 `SCRUM`으로 제한한다.
- Jira 키 뒤 설명은 소문자 kebab-case를 사용한다.
- 한 브랜치는 하나의 Jira 티켓만 구현한다.
- 브랜치 설명은 티켓의 목적을 짧게 나타낸다.
- 일반 작업은 `dev`에서 분기하고 `dev`로 Pull Request를 생성한다.
- 배포 준비는 `dev`에서 `main`으로 Pull Request를 생성한다.

## Jira 중심 작업 생명주기

1. 현재 사용자에게 할당되고 완료되지 않은 Jira 티켓을 조회한다.
2. 선택한 티켓의 목표, 완료 조건, 범위 밖, 의존성, 관련 티켓과 현재 상태를 읽는다.
3. 구현에 필요한 정보가 부족하면 코드부터 작성하지 않고 Jira 티켓을 보완하거나 담당자에게 확인한다.
4. 티켓을 실제 작업 시작 상태로 전환한다.
5. 티켓 유형에 맞는 `feature/` 또는 `fix/` 브랜치를 `dev`에서 생성한다.
6. 저장소 지침과 티켓을 입력으로 구현 계획을 작성한다.
7. 승인된 범위만 구현하고 자동 검사와 UI 검증을 수행한다.
8. 커밋과 Pull Request에 Jira 키를 포함한다.
9. Pull Request 링크와 주요 구현·검증 결과를 Jira 티켓에 기록한다.
10. 최소 한 번의 리뷰와 필수 CI를 통과한 후 병합한다.
11. 병합 결과를 확인한 뒤 Jira 티켓을 완료 상태로 전환한다.

AI가 Jira 티켓을 가져와 작업할 때도 동일한 순서를 사용한다. Jira 상태 변경, 댓글 작성 또는 티켓 수정은 외부 상태 변경이므로 사용자의 해당 작업 요청 또는 승인을 받은 뒤 수행한다.

## 코드 스타일

모든 지원 파일은 Prettier와 ESLint를 사용한다.

```js
{
    semi: true,
    singleQuote: true,
    tabWidth: 4,
    trailingComma: 'all',
    printWidth: 100,
}
```

- 세미콜론을 사용한다.
- 문자열은 싱글 쿼트를 사용한다.
- 들여쓰기는 공백 네 칸을 사용한다.
- Prettier는 포맷의 단일원천이다.
- ESLint는 코드 품질과 정적 규칙을 검사한다.
- 기존 코드 전체 포맷은 Claude의 초기 세팅이 끝난 뒤 별도 `style:` 티켓과 커밋으로 수행한다. 팀 규칙 도입 커밋에 기능 변경이나 전체 포맷 변경을 섞지 않는다.

## 커밋 규칙

기본 형식:

```text
type: 작업 내용
```

허용 타입:

| 타입       | 설명                                      |
| ---------- | ----------------------------------------- |
| `feat`     | 새로운 기능 추가                          |
| `fix`      | 버그 수정                                 |
| `docs`     | 코드 변경 없는 문서 수정                  |
| `style`    | 논리 변경 없는 코드 포맷팅 등 스타일 변경 |
| `refactor` | 기능 변화 없는 리팩터링                   |
| `test`     | 테스트 코드 추가 또는 수정                |
| `chore`    | 빌드, 패키지 매니저 설정 등 기타 작업     |
| `design`   | CSS 등 사용자 UI 디자인 변경              |
| `comment`  | 필요한 주석 추가 및 변경                  |
| `rename`   | 파일 또는 폴더 이름 수정 및 이동만 수행   |
| `remove`   | 파일 삭제만 수행                          |
| `!HOTFIX`  | 치명적 버그의 긴급 수정                   |

예시:

```text
feat: 프로필 화면 기본 구조 추가
design: 홈 요약 카드 스타일 적용
fix: 토큰 갱신 실패 상태 처리
!HOTFIX: 앱 시작 시 발생하는 크래시 수정
```

커밋 메시지 검사는 commitlint로 강제한다. 기본 Conventional Commits 파서에서 `!HOTFIX`를 타입으로 인식하도록 헤더 파서를 명시적으로 확장한다.

## Pull Request 규칙

### 생성 기준

- Jira 티켓의 기능 단위 작업과 로컬 검증이 끝났을 때 생성한다.
- 일반 작업 브랜치는 `dev`를 대상으로 한다.
- `main` 대상 Pull Request는 `dev`에서만 생성한다.

### 제목

```text
[타입] JIRA-KEY 제목
```

예시:

```text
[feat] SCRUM-170 프로필 화면 구현
[fix] SCRUM-152 토큰 갱신 오류 수정
```

타입은 커밋 타입과 같은 목록을 사용한다.

### 본문 템플릿

```markdown
## 📌 관련 Jira 티켓

- [SCRUM-170](https://breathless-youth.atlassian.net/browse/SCRUM-170)

## 작업 내용

- 주요 변경 사항

## 📸 스크린샷 / 테스트 결과

- UI 스크린샷, API 응답 또는 실행 결과

## 🔍 리뷰 포인트

- 리뷰어가 집중해서 확인할 부분

## 체크리스트

- [ ] Jira 티켓의 완료 조건 충족
- [ ] 커밋 메시지 컨벤션 준수
- [ ] 로컬 빌드·린트·타입 검사·테스트 성공
- [ ] 불필요한 주석과 `console.log` 제거
- [ ] 최소 한 명 이상 리뷰 완료
- [ ] 리뷰 코멘트 반영 완료
```

Jira 티켓은 GitHub Issue가 아니므로 `close #번호` 문법을 사용하지 않는다. 대신 Jira 링크를 명시하고 Jira 티켓 댓글 또는 개발 패널에 Pull Request를 연결한다.

## 리뷰 규칙

- 병합 전에 최소 한 명 이상의 리뷰를 받는다.
- 리뷰 코멘트를 반영하거나 기술적 근거를 남기고 해결 처리한 뒤 병합한다.
- AI 리뷰도 수행할 수 있지만 GitHub Ruleset의 공식 승인으로 인정하려면 승인 권한이 있는 GitHub 사용자 또는 봇 계정이 `APPROVE` 리뷰를 남겨야 한다.
- 일반 AI 리뷰는 PR 본문 체크리스트와 리뷰 결과 문서로 기록하되 사람의 GitHub 승인을 자동 대체하지 않는다.
- 작성자는 자신의 Pull Request를 단독 승인·병합하지 않는다.

## 저장소 자동화

### Prettier와 ESLint

- 공유 Prettier 설정을 싱글 쿼트, 세미콜론, 네 칸 들여쓰기로 변경한다.
- 기존 ESLint 구성을 유지하고 모든 앱과 패키지가 루트 `pnpm lint`에 참여하게 한다.
- `lint-staged`는 지원 파일을 Prettier로 포맷하고 TypeScript/JavaScript 파일을 ESLint로 검사한다.

### Git 훅

- `pre-commit`: staged 파일의 Prettier와 ESLint 검사
- `commit-msg`: 허용 커밋 타입과 메시지 형식 검사
- `pre-push`: 로컬에서 `main`과 `dev` 직접 push 차단

로컬 훅은 `--no-verify`로 우회할 수 있으므로 최종 강제 수단으로 간주하지 않는다.

### GitHub Actions

- `pull_request`에서 CI를 실행한다.
- `main`과 `dev` push에서 CI를 실행해 보호 설정 우회 여부도 감지한다.
- 별도의 정책 검사 job에서 다음을 검증한다.
  - 작업 브랜치 이름과 Jira 키 형식
  - 일반 PR의 base가 `dev`인지
  - `main` PR의 head가 `dev`인지
  - PR 제목이 `[타입] SCRUM-번호 제목` 형식인지
- 품질 job에서 lint, typecheck, test, format check와 빌드를 실행한다.

## GitHub Ruleset

GitHub 저장소 관리자 설정에서 `main`과 `dev`에 다음 규칙을 적용한다.

### 공통

- Require a pull request before merging
- Required approvals: 1
- Dismiss stale approvals when new commits are pushed
- Require conversation resolution before merging
- Require status checks before merging
- Block force pushes
- Block deletions
- 관리자를 포함해 우회 권한을 최소화

### `main`

- `dev` 이외 브랜치에서 시작한 PR은 저장소 정책 검사로 차단
- 배포 가능한 상태를 검증하는 전체 CI를 필수 상태 검사로 지정

### `dev`

- `feature/SCRUM-*` 또는 `fix/SCRUM-*` 작업 브랜치의 PR을 받음
- 전체 CI와 PR 정책 검사를 필수 상태 검사로 지정

Ruleset은 GitHub CLI 인증 후 저장소 API 또는 GitHub 설정 화면에서 적용하고, 적용 직후 읽기 API로 활성 상태를 재검증한다.

## AI 작업 계약

모든 AI는 코드 작업을 시작하기 전에 다음을 출력한다.

```text
Jira 티켓:
티켓 상태와 완료 조건:
브랜치:
수정할 파일:
보호할 파일:
구현 계획:
검증 방법:
```

다음 경우 작업을 시작하지 않는다.

- Jira 티켓이 없거나 식별할 수 없음
- 티켓 담당자와 요청자가 다르고 작업 위임이 확인되지 않음
- 완료 조건이 구현 방향을 결정할 만큼 구체적이지 않음
- 브랜치 또는 파일이 다른 에이전트의 활성 작업과 충돌함
- 티켓 범위를 넘어서는 아키텍처 변경에 대한 승인이 없음

AI가 완료를 보고할 때는 커밋, 테스트 결과, Pull Request와 Jira 상태를 함께 요약한다.

## 도입 순서

1. Git·GitHub·Jira 워크플로 문서와 `AGENTS.md` 참조를 추가한다.
2. Prettier, lint-staged, commitlint와 Husky 훅을 팀 규칙에 맞춘다.
3. PR 템플릿과 GitHub Actions 정책 검사를 추가한다.
4. 기존 초기 세팅 완료 후 별도 스타일 티켓으로 전체 포맷을 정규화한다.
5. GitHub CLI를 인증한다.
6. 원격 `dev` 브랜치 존재 여부를 확인하고 없으면 `main` 기준으로 생성한다.
7. `main`과 `dev` Ruleset을 적용하고 활성 규칙을 검증한다.
8. 테스트용 Jira 티켓 또는 실제 첫 FE 티켓으로 조회→브랜치→PR→리뷰→병합 흐름을 검증한다.
9. 검증 중 발견한 예외를 문서와 자동 검사에 반영한다.

## 성공 기준

- 코드 작업은 항상 담당 Jira 티켓에서 시작한다.
- 브랜치와 PR 제목만으로 Jira 티켓을 식별할 수 있다.
- 일반 작업은 `dev`, 배포 준비는 `main`으로만 흐른다.
- `main`과 `dev` 직접 push가 GitHub Ruleset으로 차단된다.
- 허용되지 않은 브랜치, PR 제목, 커밋 타입과 코드 스타일이 자동 검사에서 실패한다.
- 최소 한 명의 리뷰와 모든 필수 상태 검사를 통과하지 않으면 병합할 수 없다.
- Jira 티켓에 Pull Request와 최종 검증 결과가 연결된다.
