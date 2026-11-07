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
- 컨테이너·코덱: **mp3, 44.1kHz, 96kbps**. 자연음·노이즈성은 mono, 음악은 stereo 96kbps. 음악을 128kbps로 두면 파일당 상한 안에 75초밖에 안 들어간다. iOS WKWebView·Android WebView 양쪽의 `decodeAudioData`가 확실히 지원하는 조합이라 고른다. ogg/opus는 iOS 디코딩이 불확실해 쓰지 않는다.
- 길이: 60~120초. 짧으면 반복이 들리고, 길면 용량이 는다.
- 상한: 파일당 1.2MB, `public/sounds/` 전체 16MB(`catalog.test.ts`가 검사). 소리 파일은 사용자가 켤 때 처음 받으므로 첫 로드 비용이 그대로 사용자에게 간다.
- 라우드니스: `-18 LUFS`로 맞춘다. 소리마다 음량이 다르면 사용자가 매번 기기 볼륨을 만진다. 장작 튀는 소리처럼 짧게 솟는 소리에 에너지가 몰린 녹음은 깨끗하게 맞출 수 없으니, 누르는 양을 바꾼 버전을 들어 보고 정한 뒤 `LICENSES.md`에 예외로 적는다. 바람처럼 뒤에 고르게 깔린 소리가 있으면 리미터가 튀는 소리마다 그 소리까지 눌렀다 풀어 끊겨 들린다. 모닥불은 그래서 리미터 없이 원음으로 실었다. 이런 소리는 mono 로 합치면 좌우가 일부 상쇄돼 더 작아지니 stereo 판도 만들어 비교한다(모닥불은 stereo -31.2, mono -34.1 LUFS). 리미터를 끄려면 마지막 인자에 `-20`처럼 충분히 낮은 값을 준다.

## 3. 루프 만들기
`scripts/encode-loop.sh <구간> <출력.mp3> [루프길이초=90] [크로스페이드초=3] [채널=1] [비트레이트=96k] [리미터 추가 입력 dB]`을 쓴다. 입력은 쓸 구간만 미리 잘라 넣는다. 입력의 앞 X초를 떼어 본체 끝에 크로스페이드로 붙여, 루프 지점이 본체 시작과 샘플 연속이 되게 한다.

음량은 `loudnorm`에 맡기지 않는다. `loudnorm`의 linear 모드는 "원본 최대치 + 키울 양"이 목표 최대치를 넘으면 알리지 않고 dynamic 모드로 넘어가, 시간에 따라 게인을 바꾸고 이음매를 깬다. 스크립트는 루프를 고리로 이어 붙인 채 4배 오버샘플링 리미터(`latency=true`)로 최대치를 누르고, 가장 조용한 10ms를 파일 시작점으로 돌린 뒤 고정 게인 하나로 맞춘다. 시작점을 돌리는 것은 mp3 디코더가 첫 프레임을 완전히 복원하지 못해 생기는 오차를 줄이기 위해서다.

음악은 루프 길이를 곡의 4마디·8마디 단위 배수로 잡는다. 박자만 맞고 단위가 어긋나면 이음매에서 화음이 바뀌어 들린다. BPM 태그는 틀린 경우가 있어(65·130이 같이 붙은 곡이 있었다) 음량 곡선의 자기상관으로 실제 되풀이 간격을 찾는다.

```
brew install ffmpeg   # 없을 때
ffmpeg -ss 6 -t 93 -i raw/rain.flac trim/rain.wav   # 쓸 구간만 자른다
bash .claude/skills/sound-asset-pipeline/scripts/encode-loop.sh trim/rain.wav out/rain.mp3 90 3 1 96k
cp out/rain.mp3 apps/web/public/sounds/rain-$(shasum -a 256 out/rain.mp3 | cut -c1-8).mp3
```

만든 파일은 자기 자신과 이어 붙여 끝→처음 지점 앞뒤 10ms의 최대 표본 변화량이 파일 안의 최대값을 넘지 않는지 재고, 두 번 이어 붙인 파일을 사용자가 직접 들어 클릭·공백을 확인한다.

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
`id`는 코드의 `SoundId`와 1:1이다. `label`은 화면 문구이며 용어집(`docs/domain-glossary.md`) 확인 뒤 확정한다. 화면은 `label`보다 `locales/{ko,en}/ambient-sound.json`의 `sounds.<id>`를 먼저 읽으므로, 소리를 더하면 두 언어 카탈로그에도 같은 키를 더한다. 빠뜨리면 영어 화면에 한국어 `label`이 보인다. 계약을 바꾸면 `_workspace/01_catalog_contract.json`을 먼저 고친다.

`file` 값은 `이름-<sha256 앞 8자리>.mp3` 꼴이어야 한다. 이 경로는 1년 immutable 캐시로 나가므로 내용이 바뀌면 이름도 바뀌어야 한다. 해시는 `shasum -a 256 <파일> | cut -c1-8`로 얻고, 틀리면 `publicAssetHashes.test.ts`가 올바른 이름을 알려준다.

## 5. 라이선스 기록
`apps/web/public/sounds/LICENSES.md`에 파일마다 한 표 행:

| 파일 | 출처 | 저작자 | 라이선스 | 원본 | 가공 |
|---|---|---|---|---|---|

원본 열에는 포맷과 길이를, 가공 열에는 시작 지점·루프 길이·크로스페이드·리미터 인자·결과 LUFS 를 적는다. 가공 열만 보고 같은 파일을 다시 만들 수 있어야 한다. 파일과 표 행은 1:1이어야 하며 QA가 대조한다.

## 6. 하지 말 것
- 사용자 승인 전 다운로드. 후보 표(§1 판별 결과 포함)를 먼저 보고한다.
- 용량 상한 초과 시 항목 추가. 비트레이트·길이를 줄인다.
- 음악(lofi)을 무리해서 넣는 것. 허용 라이선스의 좋은 트랙은 드물다. 후보를 들어 보고 마음에 드는 곡이 없으면 넣지 않는다.
