# FocusMakers FE — AI 에이전트 공통 진입점

프로젝트 전반 규칙(구조, 아키텍처 경계, 개인정보 원칙, 코딩 컨벤션)은 [CLAUDE.md](./CLAUDE.md)를 따른다.

## 먼저 읽을 것 (`.ai/` 위키)

기획·용어·정책·기술 결정의 원본은 `.ai/` 서브모듈(팀 위키, 프라이빗)이다. 이 저장소의 문서와 위키가 다르면 위키가 기준이고, 어긋난 쪽을 고치는 PR을 올린다. `.ai/`가 비어 있으면 `git submodule update --init`으로 받는다. CI와 배포는 서브모듈을 받지 않으며, 빌드 입력도 아니다.

| 언제                  | 읽을 문서                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 모든 작업 전          | `.ai/ai/agent-rules.md` (에이전트 필수 규칙), `.ai/conventions/git-workflow.md`, `.ai/conventions/coding-style.md` |
| 화면·문구·도메인 로직 | `.ai/project/glossary.md` (용어와 사용자 노출 표기), `.ai/product/voice-tone.md` (문구 기준)                       |
| 기능 티켓 착수        | `.ai/product/specs/BY-NNN-*.md` (티켓별 기획 명세, 정책 결정 표가 원본)                                            |
| 구조·기술 선택        | `.ai/decisions/` (ADR)                                                                                             |

위키를 고쳐야 하면 `.ai` 저장소에 브랜치를 따 PR을 올리고, 머지된 뒤 이 저장소의 서브모듈 포인터를 올린다.

## PR 제목 컨벤션 (CI 강제)

```text
[타입] JIRA-KEY 제목
```

- 예: `[feat] BY-147 공부 세션 제출 API 연동`
- Jira 티켓이 없는 잡무는 JIRA-KEY 생략 가능: `[chore] PR 템플릿 적용`
- `dev → main` 릴리즈 PR은 `release` 타입: `[release] dev → main 소셜룸 운영 배포`
- JIRA-KEY는 반드시 `BY-숫자` 형식 — GitHub 이슈번호(`#171`)를 쓰지 말 것
- 타입: `feat` `fix` `docs` `style` `refactor` `test` `chore` `design` `comment` `rename` `remove` `release` `!HOTFIX`
- Conventional Commits 스타일(`feat(web): ...`)은 커밋 메시지 전용 — PR 제목에 쓰지 말 것
- CI(`.github/workflows/ci.yml`의 `pr-title` job)가 형식을 검사해 위반 시 실패한다
