# BY-495 U1 업데이트 안내 시트 제거 설계

- 날짜: 2026-08-31
- 티켓: BY-495
- 브랜치: `feature/BY-495-remove-update-notice-sheet` (base: `dev`)

## 배경

U1 업데이트 안내 시트 `UpdateNoticeSheet`가 웹과 모바일에 따로 구현돼 있고, 업데이트 알림은 시트 대신 U2 공지사항 배너(BY-376 API, BY-377 화면)로 대체하기로 했다. 현재 U1은 웹은 `VITE_UPDATE_NOTICE_ENABLED` 미정의, 모바일은 `app.json`의 `extra.updateNoticeEnabled`가 `false`라 양쪽 모두 노출되지 않는다. 죽어 있는 기능이므로 단계적 제거 없이 한 번에 걷어낸다.

## 삭제 파일

- `apps/web/src/features/home/UpdateNoticeSheet.tsx`
- `apps/web/src/features/home/UpdateNoticeSheetHost.tsx`
- `apps/web/src/features/home/updateNotice.ts`
- `apps/web/src/features/home/__tests__/UpdateNoticeSheet.test.tsx`
- `apps/web/src/features/home/__tests__/updateNotice.test.ts`
- `apps/mobile/components/UpdateNoticeSheet.tsx`
- `apps/mobile/components/UpdateNoticeSheetHost.tsx`
- `apps/mobile/lib/updateNotice.ts`
- `apps/mobile/__tests__/update-notice-sheet.test.tsx`
- `apps/mobile/lib/__tests__/updateNotice.test.ts`
- `docs/screens/SCR-U1-update-sheet.md`

## 부분 편집

- `apps/web/src/routes/HomeTabPage.tsx`에서 `UpdateNoticeSheetHost` import와 렌더를 뺀다.
- `apps/mobile/app/(tabs)/index.tsx`에서 `UpdateNoticeSheetHost` import와 렌더를 뺀다.
- `apps/mobile/app.json`에서 `extra.updateNoticeEnabled` 항목을 뺀다.
- `apps/web/src/routes/__tests__/HomeTabPage.test.tsx`에서 `update-notice-sheet` 비노출 케이스를 뺀다.
- `apps/mobile/__tests__/home.test.tsx`에서 U1 테스트 파일을 가리키던 주석 문구를 지운다.
- `docs/screen-ownership.md`에서 U1 행을 표에서 지운다.
- `docs/superpowers/specs/2026-08-15-u2-notice-popup-design.md`의 U1 언급 정리(노출 순서 결정, dismiss 키 관례)는 이 파일이 dev에 없어서 `feature/BY-377-notice-popup` 브랜치에서 한다. 그 브랜치의 문서 헤더에 U1 제거와 노출 순서 결정 폐기가 이미 기록돼 있다.

## 유지

- `apps/mobile/components/PrimaryCtaButton.tsx`는 `permission-denied.tsx`와 `RemoteWebViewHost.tsx`도 쓰는 공유 컴포넌트라 그대로 둔다.
- 사용자 기기에 남은 열람 기록(웹 localStorage 키 `focuson.updateNoticeSeen`, 모바일 SecureStore 키)은 지우는 코드를 넣지 않는다. 남아 있어도 아무 동작에 영향이 없고, 정리 코드를 넣으면 삭제 작업에 새 코드가 생기기 때문이다.

## 테스트 방침

새 동작이 없는 삭제 작업이라 새 테스트는 쓰지 않는다. 검증은 다음 세 가지다.

- `HomeTabPage.test.tsx`의 남은 홈탭 케이스가 삭제 후에도 통과한다.
- 전체 `test`, `typecheck`, `lint`가 통과한다.
- 저장소 전체에서 `UpdateNoticeSheet`와 `updateNotice` 참조가 0건이다 (이 스펙 문서와 릴리스 기록 같은 이력성 문서는 제외).

## 실패 경로

런타임 로직을 추가하지 않으므로 새로 생기는 실패 경로는 없다.

## 범위 밖

- U2 공지 배너 구현은 BY-377에서 다룬다.
- 백엔드 공지 API는 BY-376에서 다룬다.
