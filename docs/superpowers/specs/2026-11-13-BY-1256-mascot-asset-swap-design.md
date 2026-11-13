# BY-1256 마스코트 도입에 따른 기존 애셋 교체 설계

- 티켓: BY-1256 (하위 BY-1259 시안, BY-1260~1263 웹, BY-1264 앱)
- 시안: Figma V3 `nmpEKUAgMwMtLdxIIXGFUB`, iOS 섹션 `10989:15170`, Android 섹션 `10996:17040`
- 브랜치: 웹 `feature/BY-1256-mascot-web`(워크트리 `frontend-BY-1256`), 앱 `feature/BY-1264-mascot-app`(워크트리 `frontend-BY-1264`), 둘 다 dev `dbe599dd` 기준

## 목표

마스코트와 어울리지 않는 예전 그림(포메 발바닥 도장, 글자 워터마크, 첫 글자 아바타, 물음표, 포메 문구)을 마스코트로 바꾸거나 지운다.
결과 화면 마스코트와 기본 프로필 마스코트는 나중에 포인트 도감에서 얻은 마스코트로 바꿀 수 있어야 한다.
이번에는 이미지 주소 하나를 받는 prop만 열고 기본값을 타이미로 둔다. 도감 목록·선택 저장은 포인트 작업에서 붙인다.

## 애셋

Figma에서 내보낸 파일을 쓴다. 웹은 `apps/web/src/assets/mascot/`에 두고 URL import 후 `<img alt="">`로 그린다(저장소 관례, SVGR 없음).
SVG 안에 큰 래스터가 섞여 있으면 PNG(필요하면 WebP)를 쓴다. 파일 하나가 100KB를 넘지 않게 한다.

| 파일                                                                | 쓰는 곳                                            |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| `timi-idle` · `timi-squint` · `timi-closed` · `timi-smile`          | 결과 화면 표정 4장(같은 캔버스)                    |
| `lampi-surprised`                                                   | 크래시 화면                                        |
| `timi-avatar`                                                       | 기본 프로필(랭킹·그룹 목록, 라이브룸, 프로필 화면) |
| `silhouette-stopwatch` · `silhouette-planner` · `silhouette-pencil` | 시상대 빈자리(CSS mask로 `text-tertiary` 색 적용)  |
| `timi-default`                                                      | 앱 스플래시 합성 원본                              |
| `camcomi-serious`                                                   | 앱 권한 거부 화면                                  |
| `lakki-profile`                                                     | Android 앱 잠금                                    |

## 웹

### 결과 화면 (BY-1260)

- `StudyCompleteHero`에서 도장 PNG(`study-complete-stamp.png`), 충격 링, `SealIcon`을 지운다. `@/assets/study-complete-stamp.png` 파일도 지운다.
- 인주 자리(72px 슬롯)에 타이미 점프 그림을 둔다. 시안의 112px는 여백을 포함한 인스턴스 상자이고, 실제 그림은 정점에서 약 73×89px(몸통 지름이 예전 인주 테와 같은 72px)다. 아래 글자 위치는 그대로다.
- 모션은 index.css keyframes와 Tailwind 임의값 `animate-[...]`으로 만든다(기존 방식, 새 의존성 없음).
  - 웅크림(scaleY 눌림) → 상승 → 정점에서 멈춘 채 유지한다. 바닥 그림자 타원은 높이에 따라 작아지고 옅어진다.
  - 표정은 웅크리는 동안 기본 → 정색 → 눈 감음(졸림) → 정색 → 웃음(점프) 순서로 바뀌고, 웃는 순간 뛰어오른다. 네 장을 겹쳐 두고 순간 전환한다.
  - 정점 도달 시각은 지금 도장이 닿는 시각(약 0.82~0.92s)에 맞춰 색종이(900ms)·햅틱(920ms) 타이밍을 그대로 쓴다. 햅틱 세기는 지금 값(heavy)을 유지한다.
  - `result-stamp-press`·`result-seal-pop`·`result-stamp-impact` keyframes는 지우고 점프용 keyframes를 새로 둔다.
- `phase="static"`(모션 줄이기, 다시 본 결과)에서는 정점 자세를 바로 보여 준다. `motion-reduce:` 클래스도 같은 결과가 되게 한다.
- 2단계(`revealed`)에서는 지금처럼 인트로 블록이 접히며 타이미도 함께 사라진다.
- 마스코트 표정 4장은 `StudyCompleteHero`의 선택 prop(`mascot`)으로 받고 기본값은 타이미다.
- 그림은 장식이라 `alt=""`이고, 접힌 블록은 지금처럼 `aria-hidden`이다.

### 타임랩스 워터마크 삭제 (BY-1261)

- `timelapseFrame.ts`에서 워터마크 그리기, `WATERMARK_*` 상수, `timelapseGlyphs`의 워터마크 글자를 지운다. `roundedRect`는 흐름 바가 쓰므로 남긴다.
- `TimelapsePreview.tsx`의 워터마크 span을 지운다.
- 4개 언어 `timelapse.json`의 `frame.watermark` 키를 지운다. `brand` 키는 공유 시트용이라 남긴다.

### 기본 프로필·시상대 빈자리 (BY-1262)

- 사진이 없거나 불러오지 못할 때 보이는 `AvatarFallback`의 첫 글자를 타이미 그림(불투명도 70%)으로 바꾼다.
- 바탕색은 지금 첫 글자 아바타 토큰을 그대로 쓴다. 다른 사람 `bg-chart-heat-1`, 나 `bg-primary-deep`, 라이브룸 타일 `bg-white/10`, 프로필 화면 `bg-primary`.
- 세 곳(`RankAvatar`, `RoomAvatarFallback`, `ProfileAvatar`)이 같은 그림을 쓰므로 작은 공용 컴포넌트 하나(`DefaultProfileMascot`, `src` 선택 prop, 기본 타이미)로 그린다.
- 첫 글자를 계산하던 코드와 prop(`initial`)은 더 쓰지 않으면 지운다. `firstGrapheme`은 다른 사용처가 없을 때만 지운다.
- 시상대 빈자리 `?`를 순위별 실루엣으로 바꾼다. 1등 타이미, 2등 플래니, 3등 몽당이. 원 배경 `bg-bg-layer-2`, 실루엣 색 `text-text-tertiary`, 실루엣 긴 변은 원 지름의 60%.

### 크래시 화면 (BY-1263)

- `ErrorFallback` 제목 위에 놀란 램피(96px, 배경 없음)를 둔다. 배경은 지금처럼 기본 테마다.
- 참조가 없는 `apps/web/src/assets/vite.svg`를 지운다.

## 앱 (BY-1264)

- 스플래시: 워드마크 위에 배경 없는 타이미를 얹은 PNG 4종(라이트·다크 × 한국어·그 외)을 다시 만든다. 생성기 `scripts/generate-splash-wordmark.swift`가 타이미 원본을 함께 그리도록 고쳐 재현 가능하게 한다. `LaunchGoalOverlay`는 같은 PNG를 쓰므로 코드 변경이 없다. `imageWidth`는 시안 비율에 맞춰 조정한다.
- 권한 거부: 66px 회색 원과 `IconCameraOff`를 캠코미 그림(96px, RN `Image`)으로 바꾼다. 접근성 숨김은 유지한다. `IconCameraOff`가 더는 안 쓰이면 지운다.
- Android 앱 잠금: 84dp 원 + 자물쇠 아이콘을 락키 프로필 이미지(77dp, 원 배경 `#FCDBCE` 포함)로 바꾼다. 알림 small icon은 `app_lock_ic_lock`을 계속 쓴다.
- `lib/i18n.ts` 한국어 `recommendedUpdate.description`의 `포메`를 `포커스 메이커스`로 바꾸고 `forceUpdate.test.ts`의 리터럴도 맞춘다.
- 참조가 없는 `assets/favicon.png`, `scripts/generate-splash-mark.js`를 지운다.

## 테스트

- 결과 화면: 인트로 동안 마스코트가 보이고, 공개 후에는 접힌 블록 안에 숨는다. 도장 img를 찾던 단언은 마스코트 기준으로 바꾼다. 모션 줄이기에서 점프 애니메이션 클래스가 없다. 색종이·햅틱 타이밍 테스트는 그대로 통과한다.
- 타임랩스: 정보가 없으면 글자를 하나도 그리지 않고 `fill`도 부르지 않는다. 미리보기에 워터마크 글자가 없다. glyphs에 워터마크 글자가 없다.
- 아바타: 사진이 없으면 마스코트 img가 보이고 첫 글자는 없다. 나 표시(`data-me`, `bg-primary-deep`)는 그대로다. 사진이 있으면 사진이 보인다.
- 시상대: 빈자리마다 순위별 실루엣이 하나씩 있고 `?` 글자는 없다.
- 크래시: 램피가 장식으로 들어가고 제목·새로고침 버튼은 그대로다.
- 앱: 권한 거부 화면 기존 테스트 통과, 문구 테스트 갱신, i18n 키 집합 테스트 통과.

## 범위 밖

그룹 공부방 좌석 캐릭터(팀원), 메달 모달, iOS 잠금 쉴드, 인터뷰 공지 이미지(팀원 확인 대기), 포인트 도감 연동.
