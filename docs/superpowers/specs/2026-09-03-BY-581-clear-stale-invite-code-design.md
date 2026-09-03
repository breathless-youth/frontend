# BY-581 소셜 홈 재진입 시 이전 초대코드 제거

2026-09-03 승인. 소셜룸을 나온 뒤 "초대코드로 참여"로 다시 들어가면 이전 코드가 입력란에 채워져 있는 문제의 설계다.

## 문제

초대 링크나 방 세션을 거친 뒤 소셜 홈에서 "초대코드로 참여"를 누르면, 입력란에 직전 초대코드가 채워진 채 뜬다.

## 원인

`SocialHomePage`의 "초대코드로 참여" 버튼이 `/social/join`으로 이동할 때 `location.search`를 통째로 넘긴다. `userId`를 유지하려는 것인데, 앞선 진입에서 URL에 남은 `code` 파라미터까지 함께 실려 간다. `InviteCodeJoinPage`는 `?code`를 입력 초깃값으로 프리필하므로 그 눌어붙은 코드가 그대로 채워진다.

## 해법

버튼이 이동할 때 `location.search`에서 `code`만 빼고 나머지는 그대로 넘긴다.

### 변경: `apps/web/src/routes/SocialHomePage.tsx`

"초대코드로 참여" 버튼의 onClick을 다음으로 바꾼다.

```tsx
onClick={() => {
  const params = new URLSearchParams(location.search);
  params.delete("code");
  navigate({ pathname: "/social/join", search: params.toString() });
}}
```

- `userId` 등 필요한 쿼리는 유지되고 `code`만 빠진다. 재진입 시 입력란이 비어 있다.
- 외부 초대 링크(`/social/join?code=NNNN`) 딥링크 진입은 이 버튼을 거치지 않으므로 프리필이 그대로 유지된다.
- BY-583의 자동 앱 열기도 `code`가 비면 조건이 거짓이라 돌지 않는다. 수동 진입에서 앱을 강제로 열지 않는 정상 동작이다.

## 테스트

- `apps/web/src/routes/__tests__/socialPages.test.tsx`의 "초대코드로 참여를 누르면 입력 화면으로 이동한다"를 확장한다.
- `?userId=7&code=0712` 상태에서 "초대코드로 참여"를 누르면 join 화면 입력란이 비어 있다.
- 이동 후에도 `userId`는 유지된다.
- 외부 딥링크 직접 진입(`/social/join?userId=7&code=0712`)은 기존대로 입력란에 코드가 프리필된다(회귀 확인).

## 범위 밖

- 딥링크 탭 셸 합류·인앱 스킴 브리지·공유 문구는 BY-582·583·584에서 완료했다.
