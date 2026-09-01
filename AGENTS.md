# FocusOn FE — AI 에이전트 공통 진입점

프로젝트 전반 규칙(구조, 아키텍처 경계, 개인정보 원칙, 코딩 컨벤션)은 [CLAUDE.md](./CLAUDE.md)를 따른다.

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
