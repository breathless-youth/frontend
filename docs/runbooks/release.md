# 릴리스 런북

GitHub Release를 만들 때 사용한다. 태그를 푸시하면 `.github/workflows/release.yml`이 릴리스와 릴리스 노트를 자동 생성한다.

## 절차

`main`의 릴리스할 커밋에서 태그를 만들어 푸시한다.

```bash
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0
```

이후 자동으로 진행된다:

1. Actions의 **Release** 워크플로가 실행된다.
2. GitHub Releases에 해당 태그의 릴리스가 생성되고, 직전 릴리스 이후 머지된 PR 제목 목록으로 릴리스 노트가 채워진다.

결과는 저장소 **Releases** 페이지에서 확인한다.

### 주의

- 태그는 **한 번에 하나씩, 버전 순서대로** 푸시한다. 한 번에 4개 이상 푸시하면 GitHub이 push 이벤트를 만들지 않아 릴리스가 조용히 생성되지 않고, 순서를 건너뛰면 릴리스 노트의 "직전 릴리스" 비교 기준이 어긋난다.

### 잘못 만든 릴리스 되돌리기

반드시 이 순서대로 (릴리스를 지우기 전에 태그를 다시 푸시하면 남은 릴리스와 충돌한다):

```bash
# 1. Releases 페이지에서 해당 릴리스 삭제
git push --delete origin v0.1.0   # 2. 원격 태그 삭제
git tag -d v0.1.0                 # 3. 로컬 태그 삭제
git tag v0.1.0 <올바른-커밋-SHA> && git push origin v0.1.0   # 4. 태그 대상 커밋을 반드시 명시해 다시 태그
```

## 버전 규칙

- **태그가 버전의 단일 출처다.** `package.json`의 `version` 필드는 관리하지 않는다.
- FE 독립 semver (`vMAJOR.MINOR.PATCH`). 백엔드·디자인 버전과 번호를 맞추지 않는다 — 호환성은 API 계약으로 관리한다.
- `v0.x` 동안: 기능 추가 = minor, 버그 수정 = patch. MVP 정식 출시 시 `v1.0.0`.
- 저장소 단일 태그를 사용한다(web/mobile 공통). 앱별 독립 배포 체계가 생기면 그때 분리를 검토한다.
