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

결과는 저장소 **Releases** 페이지에서 확인한다. 잘못 만든 릴리스는 Releases 페이지에서 삭제 후 `git push --delete origin v0.1.0`으로 태그를 지우고 다시 태그한다.

## 버전 규칙

- **태그가 버전의 단일 출처다.** `package.json`의 `version` 필드는 관리하지 않는다.
- FE 독립 semver (`vMAJOR.MINOR.PATCH`). 백엔드·디자인 버전과 번호를 맞추지 않는다 — 호환성은 API 계약으로 관리한다.
- `v0.x` 동안: 기능 추가 = minor, 버그 수정 = patch. MVP 정식 출시 시 `v1.0.0`.
- 저장소 단일 태그를 사용한다(web/mobile 공통). 앱별 독립 배포 체계가 생기면 그때 분리를 검토한다.
