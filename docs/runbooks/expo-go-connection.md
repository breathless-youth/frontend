# Expo Go 연결 문제 런북

Expo Go에서 QR 코드를 읽은 뒤 `Could not connect to the server` 또는 타임아웃이 발생할 때 사용한다.

## 가장 빠른 복구: 터널 모드

LAN 포트가 방화벽, 회사 정책, 공유기 AP 격리, 모바일 핫스팟 정책으로 차단될 수 있다. 이 경우 같은 Wi-Fi를 계속 바꾸지 말고 터널을 사용한다.

```powershell
pnpm --filter mobile exec expo start --tunnel --clear --port 8081
```

새로 열린 터미널의 QR 코드를 Expo Go에서 다시 스캔한다. 터널은 PC가 외부로 연결하므로 휴대폰과 PC가 같은 Wi-Fi에 있을 필요가 없다.

## 기본 실행 규칙

모노레포 루트에서 `pnpm expo start`를 실행하지 않는다. 루트가 Expo 프로젝트로 잡히면 manifest의 `projectRoot`가 저장소 루트가 되고, entry가 `expo/AppEntry`가 된다.

항상 모바일 앱 범위로 실행한다.

```powershell
# 일반 LAN 모드
pnpm --filter mobile exec expo start --lan --clear --port 8081

# LAN 연결 실패 시 터널 모드
pnpm --filter mobile exec expo start --tunnel --clear --port 8081
```

## 1분 진단 순서

### 1. SDK 호환성 확인

Expo Go 앱의 SDK와 프로젝트 SDK가 달라지면 연결 오류처럼 보일 수 있다. 현재 프로젝트는 Expo Go 54 계열과 맞추기 위해 SDK 54를 사용한다.

```powershell
pnpm --filter mobile list expo react react-native --depth 0
pnpm --dir apps/mobile dlx expo-doctor@latest --verbose
```

`expo-doctor`가 패키지 버전 불일치를 보고하면 `expo install --fix`로 임의의 버전 조합 대신 SDK가 요구하는 버전으로 정렬한다.

```powershell
pnpm --filter mobile exec expo install --fix
pnpm install
```

### 2. 실제 Expo manifest 확인

Android Expo Go 요청과 같은 헤더로 manifest를 조회한다. `runtime`과 `sdk`가 `exposdk:54.0.0` 및 `54.0.0`이고, `projectRoot`가 `apps/mobile`이어야 한다.

```powershell
$expoManifestResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8081' -Headers @{
  Accept = 'application/expo+json,application/json'
  'expo-platform' = 'android'
  'expo-protocol-version' = '0'
}
$expoManifestText = [System.Text.Encoding]::UTF8.GetString($expoManifestResponse.Content)
$expoManifest = $expoManifestText | ConvertFrom-Json
$expoManifest.runtimeVersion
$expoManifest.extra.expoClient.sdkVersion
$expoManifest.extra.expoGo.developer.projectRoot
```

다음은 잘못된 실행 경로의 신호다.

- `runtime=exposdk:57.0.0` 등 Expo Go와 다른 SDK가 나온다.
- `projectRoot`가 `apps/mobile`이 아니라 저장소 루트다.
- `launchAsset.url`에 `expo/AppEntry.bundle`가 나온다. 정상 모바일 앱은 `expo-router/entry.bundle`이다.

### 3. LAN만 실패할 때

다음 조건이면 LAN 모드가 휴대폰에서 실패할 수 있다.

- Windows 방화벽의 인바운드 차단
- 조직 정책으로 로컬 방화벽 예외 규칙을 만들 수 없음
- 공유기/핫스팟의 클라이언트 격리
- VPN 또는 보안 프로그램

이 경우 방화벽을 임의로 끄거나 포트를 열지 말고 터널 모드로 전환한다. 터널도 실패하면 휴대폰의 VPN·Private DNS를 일시적으로 끄고 새 QR을 스캔한 뒤, 터널 URL의 HTTP 응답과 Expo CLI 로그를 함께 확인한다.

## 검증 기준

터널이 준비되면 Expo CLI 로그에 `Tunnel connected.`와 `Tunnel ready.`가 출력된다. 공개 주소에서 manifest와 Android bundle이 각각 HTTP 200이면 PC와 Expo 터널 사이의 경로는 정상이다.

```powershell
curl.exe --connect-timeout 10 --max-time 20 -sS -D - -o NUL `
  -H 'Accept: application/expo+json,application/json' `
  -H 'expo-platform: android' `
  -H 'expo-protocol-version: 0' `
  https://<tunnel-host>.exp.direct
```

휴대폰에서 실제 앱이 열리는 것은 마지막 확인 단계다. QR을 다시 스캔할 때는 이전 LAN QR이 아니라 현재 터널 Metro 창에 표시된 QR을 사용한다.
