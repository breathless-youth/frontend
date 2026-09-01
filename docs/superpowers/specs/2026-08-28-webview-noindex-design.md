# 웹뷰 도메인 검색엔진 색인 차단 설계

- 티켓: [BY-416](https://breathless-youth.atlassian.net/browse/BY-416)
- 대상: `apps/web` (`https://web.sunqstudio.kr`)
- base 브랜치: `main`

## 문제

웹뷰 도메인 `https://web.sunqstudio.kr`가 구글 검색 결과에 노출된다. 앱 안에서만 열리는 화면이라
검색에 잡힐 이유가 없다.

2026-08-28 라이브 응답을 확인한 결과 색인을 막는 장치가 하나도 없다.

- `robots.txt` 파일이 없어서 `/robots.txt` 요청이 SPA rewrite에 걸려 `index.html`을 200으로 돌려준다.
- 응답 헤더에 `X-Robots-Tag`가 없다.
- `index.html`에 `<meta name="robots">`가 없다.

## 방식 선택

`robots.txt`의 `Disallow`가 아니라 `X-Robots-Tag: noindex, nofollow` 헤더를 쓴다.

`Disallow`는 크롤링을 막는 지시이지 색인을 지우는 지시가 아니다. 이미 검색 결과에 잡힌 URL은
`Disallow`를 걸어도 결과에 남을 수 있고, 크롤러가 페이지를 아예 읽지 못하게 되므로 색인에서 빼라는
신호를 전달할 통로까지 사라진다. 이번 목적은 이미 잡힌 것을 내리는 것이므로 `noindex`가 맞다.

`nofollow`를 함께 넣는 이유는 SPA rewrite 때문이다. 모든 경로가 `index.html`을 200으로 돌려주는
구조라서, 크롤러가 존재하지 않는 경로까지 링크를 타고 계속 파고들 수 있다.

같은 이유로 `robots.txt`는 두지 않는다. `Disallow`를 넣으면 위 신호가 막히고, `Allow`만 적은
파일은 없는 것과 동작이 같다.

## 변경 내용

`apps/web/vercel.json`의 `headers` 배열 맨 앞에 전 경로 대상 규칙을 추가한다.

```json
{
  "source": "/(.*)",
  "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
}
```

기존 COOP/COEP 규칙에 키를 얹지 않고 규칙을 따로 두는 이유는, 그 규칙의 `source`가
`/((?!contact).*)`라서 `/contact`를 제외하기 때문이다. 거기에 얹으면 `/contact`만 색인이 열린 채
남는다.

두 규칙이 같은 경로에 매칭돼도 COOP/COEP는 그대로 유지된다. Vercel의 `headers`는 첫 매칭에서
멈추지 않고 매칭되는 규칙을 전부 적용하는 것이 기본 동작이다. 구형 `routes`에서 `"continue": true`를
붙여야 했던 동작이 `headers`에서는 기본값이라고 공식 문서가 명시한다.

## 영향 범위

- 앱 웹뷰 동작에는 영향이 없다. WebView는 `X-Robots-Tag`를 해석하지 않는다.
- 딥링크와 CORS 설정은 건드리지 않는다.
- 랜딩 사이트(`focusmakers-landing`)는 검색에 잡혀야 하므로 범위 밖이다.
- `api.sunqstudio.kr`도 범위 밖이다.

## 테스트

`apps/web`에 `vercel.json` 가드 테스트 하나를 추가한다. 모바일의 `appTransportSecurity.test.ts`가
`app.json`을 검사하는 것과 같은 방식이다.

검증 대상은 두 가지다.

- 전 경로(`/(.*)`)를 대상으로 하는 규칙에 `X-Robots-Tag: noindex`가 있다.
- 기존 COOP/COEP 규칙이 그대로 남아 있다.

설정 파일 한 줄이라 런타임 동작을 단위 테스트로 재현할 수 없다. 이 테스트가 막으려는 것은 나중에
누군가 헤더를 지우거나 대상 경로를 좁히는 회귀다.

## 저장소 밖 후속 작업

배포만으로는 이미 색인된 URL이 즉시 사라지지 않는다. 크롤러가 다시 방문해 `noindex`를 읽어야 하고
보통 며칠에서 몇 주 걸린다. Google Search Console의 삭제 도구로 즉시 내릴 수 있으며 이건 저장소
작업이 아니다.
