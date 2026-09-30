# BY-777 폰트 Pretendard 복구와 로딩 개선 설계

## 목표

- 웹과 모바일 셸이 Pretendard를 쓴다.
- 두 번째 실행부터 폰트가 바뀌어 보이지 않는다.

## 확정한 결정

| 항목              | 결정                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 웹 폰트 공급      | `pretendard@1.3.9` npm 패키지의 가변 다이나믹 서브셋 CSS를 `main.tsx`에서 import한다. Tailwind의 CSS @import에 맡기면 url() 재작성과 해시가 불확실해 Vite가 직접 처리하는 JS import를 쓴다. 파일을 저장소에 복사하는 안은 버전 갱신이 번거로워 택하지 않았다 |
| 캐시              | `vercel.json`에 `/assets/(.*)`로 `Cache-Control: public, max-age=31536000, immutable`을 건다. 폰트뿐 아니라 해시된 JS·CSS도 대상이다. `index.html`은 지금처럼 매번 확인한다                                                                                  |
| preload           | 넣지 않는다. 다이나믹 서브셋은 화면마다 필요한 조각이 달라 미리 받을 파일을 특정하기 어렵다                                                                                                                                                                  |
| 모바일 셸         | 같은 패키지의 정적 OTF(Regular·Bold)를 `useFonts` 키 `Pretendard`·`PretendardBold`로 올린다. 가변 TTF는 6.7MB이고 iOS에서 굵기가 먹지 않는다(BY-718)                                                                                                         |
| 스플래시 워드마크 | 생성 스크립트를 Pretendard ExtraBold로 바꾸고 PNG를 다시 만든다                                                                                                                                                                                              |
| 옛 설계 문서      | 나눔스퀘어 설계·BY-729·BY-737 문서는 당시 기록이라 고치지 않는다                                                                                                                                                                                             |

## 배경 실측

- 스테이징은 해시된 JS 번들(`/assets/index-*.js`)도 `cache-control: public, max-age=0, must-revalidate`로 나간다. Vercel 기본값이라 해시 경로로 옮기는 것만으로는 긴 캐시가 걸리지 않는다.
- 가변 다이나믹 서브셋은 woff2 92개, 합계 2.96MB, 개당 약 30KB이고 한 파일에 모든 굵기가 들어 있다.
- 웹은 500·600·700·800 굵기를 쓴다. 나눔스퀘어라운드는 400·700·800만 있어 500·600이 가까운 굵기로 대체돼 보였다.
- COEP `require-corp` 아래라도 같은 출처에서 받는 폰트라 CORP 설정이 필요 없다.

## 구성

### 웹

- `main.tsx`에서 `pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css`를 import하고, `index.css`의 나눔 `@font-face` 3개를 지운다.
- `--font-sans`는 `"Pretendard Variable", "Pretendard", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`로 둔다. 공식 CSS가 선언하는 패밀리 이름이 `Pretendard Variable`이다.
- `public/fonts`의 나눔 woff2 3개를 지운다.
- `vercel.json`에 위 캐시 헤더를 추가한다.
- `packages/design-tokens`의 타이포그래피 주석을 Pretendard로 되돌린다.

### 모바일 셸

- `app/_layout.tsx`의 `useFonts`를 `Pretendard`·`PretendardBold`로 바꾸고 패키지의 OTF를 `require`한다.
- `tailwind.config.js`의 `sans`·`sans-bold`와 `TabBar.tsx`에 박힌 폰트 이름을 바꾼다.
- `scripts/generate-splash-wordmark.swift`를 Pretendard ExtraBold OTF로 바꾸고 워드마크 PNG를 다시 만든다.
- `assets/fonts`의 나눔 TTF 3개를 지운다.

## 검증

- `fontStack.test.ts`가 다이나믹 서브셋 import와 `--font-sans`, 나눔 참조 부재를 단언한다.
- `fontConfig.test.ts`가 Pretendard 키를 단언한다.
- `vercel.json`의 `/assets` 캐시 헤더를 테스트로 고정한다.
- 웹 빌드 산출물 `dist/assets`에 해시된 woff2가 나오는지 확인한다.
- 실기기에서 모든 화면이 Pretendard로 보이는지(라이트·다크), 두 번째 실행부터 폰트 바뀜이 없는지, 스플래시 워드마크가 제대로 보이는지 확인한다.
- 머지 뒤 스테이징에서 폰트와 JS 응답의 캐시 헤더를 `curl`로 확인한다.
