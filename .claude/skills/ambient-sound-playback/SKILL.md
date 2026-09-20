---
name: ambient-sound-playback
description: "FocusMakers 스터디룸 배경음(백색소음·핑크/브라운 노이즈·빗소리·카페·lofi) 재생 구현 지식. Web Audio API 기반 플레이어, 노이즈 합성, 끊김 없는 루프, 세션 일시정지·재개·종료·백그라운드 연동, localStorage 설정 저장, WebView(iOS WKWebView·Android) 제약과 테스트 방법을 담는다. apps/web에서 소리·오디오·사운드·백색소음·배경음·앰비언트·lofi 재생을 구현·수정·리뷰할 때 반드시 읽을 것. 음원 파일 수급·라이선스·인코딩은 sound-asset-pipeline 스킬이 맡는다."
---

# Ambient Sound Playback

배경음은 **로컬 재생 문제**다. 소셜룸 P2P는 영상 전용(`visionConfig.ts`의 `audio: false`, `peerMesh.ts`는 video 트랜시버만)이라 믹싱·에코 걱정이 없고, 세션은 백그라운드 진입 시 이미 일시정지되므로 백그라운드 재생도 필요 없다. 남는 것은 "세션이 도는 동안 사용자가 고른 소리를 끊김 없이 틀고, 세션 상태를 따라 멈추고 다시 트는 것"뿐이다.

## 왜 `<audio>`가 아니라 Web Audio API인가
- iOS WKWebView에서 `HTMLMediaElement.volume`은 읽기 전용(항상 1)이다. 나중에 볼륨을 넣으려면 `GainNode`가 유일한 길이다.
- `<audio loop>`는 mp3 인코더 패딩 때문에 루프 경계에 수십 ms 공백이 생긴다. `AudioBufferSourceNode.loop`은 샘플 단위로 이어 붙인다.
- 화이트·핑크·브라운 노이즈는 파일 없이 버퍼를 생성해 재생한다. 에셋·라이선스·다운로드가 0이다.

## 모듈 배치 (`apps/web/src/features/ambient-sound/`)
| 파일 | 역할 | 테스트 |
|---|---|---|
| `catalog.ts` | `SoundId`, 카탈로그 타입, `public/sounds/catalog.json` 파서. `kind: "synth" | "file"` | 파서 단위 |
| `noiseSynth.ts` | 화이트/핑크/브라운 노이즈 `AudioBuffer` 생성(2~4초 루프). 핑크는 Paul Kellet 필터, 브라운은 누적 적분 + 누설 | 순수 함수: 길이·RMS·클리핑 없음 단언 |
| `ambientPlayer.ts` | `AmbientPlayer` 인터페이스 `{ select(id), pause(), resume(), stop(), state }`. 구현 `createWebAudioPlayer()`와 테스트용 `createMemoryPlayer()`(명령 기록) | 메모리 구현으로 호출 순서 단언 |
| `ambientSoundStore.ts` | 마지막 선택·켜짐 여부 localStorage 저장. `onboardingGuideStore.ts`의 교체 가능한 store 패턴을 그대로 복사 | 메모리 store로 단위 |
| `useAmbientSound.ts` | 세션 상태를 플레이어 명령으로 번역하는 훅. 컴포넌트는 이 훅만 본다 | RTL `renderHook` + 메모리 플레이어 |
| `components/AmbientSoundSheet.tsx` | 선택 시트. `components/ui/dialog.tsx`(radix) 위에 조립. 상태·aria·텍스트만 테스트 | 컴포넌트 |
| `__tests__/` | 위 테스트 | |

설정 저장은 sessionStorage가 아니라 localStorage를 쓴다. 탭 화면과 세션 화면이 별도 WebView라 sessionStorage가 공유되지 않는다(`socialRoomNotice.ts` 상단 주석과 같은 이유). 저장소는 인터페이스 뒤에 두어 나중에 서버 설정으로 바꿀 수 있게 한다.

## 세션 라이프사이클 연결
연결 지점의 정확한 파일·행은 `references/plug-points.md`를 읽는다. 규칙만 적으면:
- **재생 시작**은 반드시 사용자 제스처 핸들러 안에서 `AudioContext`를 만들거나 `resume()`한다. 세션 시작 탭, 시트에서 소리 선택 탭이 그 제스처다. 브라우저 단독 배포는 자동재생 정책이 걸리고, WebView는 `mediaPlaybackRequiresUserAction={false}`라 느슨하지만 같은 코드로 둘 다 통과시킨다.
- `pause(trigger)`가 MANUAL이든 BACKGROUND이든 소리를 멈춘다. `resume()`이면 다시 튼다. `endAndSubmit()`이면 `stop()`하고 컨텍스트를 닫는다. 세션 화면 언마운트 때도 `stop()`한다(뒤로가기·라우팅).
- iOS는 전화·알람 뒤 `AudioContext.state`가 `"interrupted"`가 된다. `statechange`를 구독해 세션이 RUNNING이면 `resume()`을 시도한다.
- 디코딩은 소리를 **선택한 시점**에 `fetch` + `decodeAudioData`로 한다. 세션 시작 때 전부 미리 받지 않는다(첫 로드 비용을 세션 시작에 얹지 않는다). 디코딩된 버퍼는 세션 동안 메모리에 캐시한다.
- 소리를 바꿀 때는 이전 소스를 `stop()`하고 새 소스를 만든다. 짧은 페이드(`GainNode` 100~200ms)는 클릭음을 없애는 최소 장치이므로 넣는다. 그 이상(크로스페이드, 믹싱)은 넣지 않는다.

## 네이티브 최소 변경
- iOS 하드웨어 무음 스위치는 WebView 오디오를 음소거한다. `RemoteWebViewHost.tsx`의 WebView에 `ignoreSilentHardwareSwitch` 프롭을 추가하는 것이 유일한 네이티브 변경이며, 새 빌드(Dev Client → production)가 필요하다. 동작 보장은 실기기 스파이크(`references/webview-audio-constraints.md` S1)로만 확인한다.
- `UIBackgroundModes: audio`, Android 포그라운드 서비스는 넣지 않는다. 세션이 백그라운드에서 멈추므로 소리도 멈추는 것이 맞다.

## 테스트 요령
- `src/test/setup.ts`는 `HTMLMediaElement.prototype.play`만 스텁한다. Web Audio는 jsdom에 없으므로 `createMemoryPlayer()`로 훅·컴포넌트를 테스트하고, `createWebAudioPlayer()`는 최소 가짜 `AudioContext`(`createBufferSource`, `createGain`, `destination`, `resume`, `close`, `state`)를 주입해 명령 순서만 단언한다.
- 단일 파일은 `pnpm --filter web exec vitest run <경로>`로 돌린다.

## 하지 말 것
- 새 npm 의존성(howler, tone 등). Web Audio API 직접 호출로 충분하다.
- 볼륨 슬라이더·타이머·믹서. 요청이 오면 그때 `GainNode` 하나로 시작한다.
- 세션 밖(홈·기록 화면)에서 재생. 세션 화면에서만 산다.
