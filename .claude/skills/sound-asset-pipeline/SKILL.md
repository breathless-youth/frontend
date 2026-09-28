---
name: sound-asset-pipeline
description: "앱에 실을 배경음·백색소음·자연음·lofi 음원 파일의 수급·라이선스 판별·루프 인코딩·카탈로그·라이선스 기록 절차. 음원 파일을 찾거나 받거나 mp3로 변환하거나 apps/web/public/sounds에 넣거나 LICENSES.md를 쓸 때 반드시 사용할 것. 재생 코드 구현은 ambient-sound-playback 스킬이 맡는다."
---

# Sound Asset Pipeline

음원은 코드와 달리 되돌리기 어려운 법적 위험을 갖는다. 출처를 문장으로 적을 수 없는 파일은 쓰지 않는다. 그 원칙 하나가 이 스킬의 전부이고, 나머지는 절차다.

## 1. 라이선스 판별
| 라이선스 | 사용 | 조건 |
|---|---|---|
| CC0 / Public Domain | 가능 | 출처만 기록. 가장 안전하므로 여기부터 찾는다 |
| 직접 녹음·합성 | 가능 | 녹음자·날짜 기록 |
| CC BY 4.0 | 가능 | 앱 내 저작자 표기 화면 필요. `LicensesPage`가 그 역할을 한다 |
| Pixabay Content License | 조건부 | 아래 "Standalone 함정"을 반드시 읽는다 |
| Mixkit License | 불가 | 이용약관이 "aggregate or collate an Item(s) and make available on a stock or inventory basis"를 금지한다. 소리를 목록으로 모아 고르게 하는 우리 구조가 정확히 여기 해당한다 |
| CC BY-NC, CC BY-SA | 불가 | 상업 앱·재배포 조건 충돌 |
| YouTube·스트리밍 추출, 출처 불명 | 불가 | 권리자가 허락해도 플랫폼 약관 위반이 남는다 |

### Standalone 함정

무료 스톡 라이선스 상당수가 "가공 없이 원형 그대로 재배포하는 것"을 금지한다. Pixabay 원문은 이렇다.

> You cannot sell or distribute Content (either in digital or physical form) on a Standalone basis. Standalone means where no creative effort has been applied to the Content and it remains in substantially the same form as it exists on our website.

우리는 원본을 그대로 싣지 않는다. 구간을 골라 자르고, 크로스페이드로 루프를 만들고, 라우드니스를 -18 LUFS로 맞춘다. 그 가공이 이 조항을 피하는 근거다. **원본을 그대로 넣으려는 유혹이 생기면 이 문단을 다시 읽는다.**

같은 이유로 소리 파일을 사용자가 내려받게 하는 기능은 만들지 않는다. 재생만 한다.

합성 노이즈(화이트·핑크·브라운)는 코드가 생성하므로 파일도 라이선스도 없다. 카탈로그에 `kind: "synth"`로만 적는다.

## 2. 포맷·용량
- 컨테이너·코덱: **mp3, 44.1kHz, 96kbps**. 자연음·노이즈성은 mono, 음악은 stereo 128kbps. iOS WKWebView·Android WebView 양쪽의 `decodeAudioData`가 확실히 지원하는 조합이라 고른다. ogg/opus는 iOS 디코딩이 불확실해 쓰지 않는다.
- 길이: 60~120초. 짧으면 반복이 들리고, 길면 용량이 는다.
- 상한: 파일당 1.2MB, `public/sounds/` 전체 6MB. 정적 자산은 Vercel 원본에서 바로 서빙되고 CDN이 없으므로 첫 로드 비용이 그대로 사용자에게 간다.
- 라우드니스: `-16 LUFS` 근처로 맞춘다(`loudnorm`). 소리마다 음량이 다르면 사용자가 매번 기기 볼륨을 만진다.

## 3. 루프 만들기
`scripts/encode-loop.sh <입력> <출력.mp3> [루프길이초=90] [크로스페이드초=3]`을 쓴다. 입력의 앞 X초를 떼어 본체 끝에 크로스페이드로 붙여, 루프 지점이 본체 시작과 샘플 연속이 되게 한다. mp3 인코더 패딩은 재생 쪽(`ambient-sound-playback`)이 버퍼 루프로 흡수한다.

```
brew install ffmpeg   # 없을 때
bash .claude/skills/sound-asset-pipeline/scripts/encode-loop.sh raw/rain.wav apps/web/public/sounds/rain.mp3 90 3
```

만든 파일은 반드시 루프 경계를 세 번 이상 들어 클릭·공백을 확인하고 결과를 보고서에 적는다.

## 4. 카탈로그 계약
`apps/web/public/sounds/catalog.json`:
```json
{
  "version": 1,
  "sounds": [
    { "id": "white", "kind": "synth", "label": "백색소음" },
    { "id": "pink", "kind": "synth", "label": "핑크노이즈" },
    { "id": "brown", "kind": "synth", "label": "브라운노이즈" },
    { "id": "rain", "kind": "file", "label": "빗소리", "file": "rain.mp3", "bytes": 1080000 }
  ]
}
```
`id`는 코드의 `SoundId`와 1:1이다. `label`은 화면 문구이며 용어집(`docs/domain-glossary.md`) 확인 뒤 확정한다. 계약을 바꾸면 `_workspace/01_catalog_contract.json`을 먼저 고친다.

## 5. 라이선스 기록
`apps/web/public/sounds/LICENSES.md`에 파일마다 한 표 행:

| 파일 | 출처 URL | 저작자 | 라이선스 | 받은 날짜 | 원본 길이 | 가공 |
|---|---|---|---|---|---|---|

가공 열에는 트림·루프·라우드니스 등 한 일을 적는다. 파일과 표 행은 1:1이어야 하며 QA가 대조한다.

## 6. 하지 말 것
- 사용자 승인 전 다운로드. 후보 표(§1 판별 결과 포함)를 먼저 보고한다.
- 용량 상한 초과 시 항목 추가. 비트레이트·길이를 줄인다.
- 음악(lofi)을 V1에 무리해서 넣는 것. 허용 라이선스의 좋은 트랙은 드물다. 못 찾으면 V2로 넘긴다.
