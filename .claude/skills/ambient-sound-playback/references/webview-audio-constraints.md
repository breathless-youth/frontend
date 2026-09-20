# WebView 오디오 제약과 실기기 스파이크

## 알려진 제약
| 플랫폼 | 제약 | 대응 |
|---|---|---|
| iOS WKWebView | 하드웨어 무음 스위치가 웹 오디오를 음소거 | `ignoreSilentHardwareSwitch` 프롭(react-native-webview). 앱 프로세스의 AVAudioSession을 playback으로 바꾸는 방식이라 WebKit 별도 프로세스에서 통하는지 실기기로 확인 |
| iOS WKWebView | `getUserMedia` 활성 중 WebKit이 오디오 세션을 playAndRecord로 바꿔 출력이 수화부로 갈 수 있음 | 카메라 켠 상태에서 스피커 출력·음량 확인(S2). 실패 시 대안이 없으므로 결과에 따라 범위 조정 |
| iOS | 전화·알람 후 `AudioContext.state === "interrupted"` | `statechange` 구독 후 `resume()` |
| iOS | `HTMLMediaElement.volume` 읽기 전용 | Web Audio `GainNode` |
| 브라우저 단독 | 자동재생 정책 — 제스처 없이 `AudioContext`가 `suspended` | 세션 시작·선택 탭 핸들러 안에서 생성·`resume()` |
| Android WebView | `mediaPlaybackRequiresUserAction={false}`로 자동재생 허용됨. 벨소리 무음은 미디어 스트림에 영향 없음 | 별도 대응 없음 |
| 공통 | mp3 인코더 패딩으로 루프 경계 클릭 | 버퍼 루프 + 필요 시 `loopStart/loopEnd` 트림 |
| 공통 | 세션 30분 동안 오디오 스레드가 추론 프레임에 주는 영향 | S3에서 추론 ms 비교 |

## 실기기 스파이크 (구현 전, Dev Client)
각 항목은 통과 조건이 있다. 결과는 `_workspace/02_spike_results.md`에 표로 기록한다.

| # | 확인 | 기기 | 통과 조건 | 실패 시 |
|---|---|---|---|---|
| S1 | 무음 스위치 ON에서 `ignoreSilentHardwareSwitch` 유무별 재생 | iOS | 프롭 ON일 때 소리 남 | 프롭 제거, 시트에 "무음 모드를 해제하세요" 안내 |
| S2 | 카메라 켜진 세션 중 출력 경로·음량 | iOS·Android | 스피커로 정상 음량 | iOS 범위 제외 검토, Android만 출시 |
| S3 | 30분 재생 중 추론 지연·발열 | 둘 다 | `DEBUG` 진단의 추론 ms 증가 없음 | 노이즈 버퍼 길이 축소, 파일 비트레이트 하향 |
| S4 | 전화 수신·알람 뒤 복귀 | iOS | 세션 재개 시 소리 자동 복귀 | 시트 재진입 시 수동 재생 |
| S5 | 루프 경계 청취(노이즈·빗소리) | 둘 다 | 클릭·공백 없음 | `loopStart/loopEnd` 트림, 크로스페이드 길이 증가 |
| S6 | 브라우저 단독(Safari·Chrome) 세션 시작 탭에서 재생 | 데스크톱·모바일 브라우저 | 첫 탭에 재생 | 선택 시트 탭으로 시작점 이동 |

스파이크 빌드는 `npx expo start --scheme focusmakers-dev`로 Dev Client에 붙인다(스킴 충돌 회피). iOS는 `https://api-dev.focusmakers.app`만 통과한다.
