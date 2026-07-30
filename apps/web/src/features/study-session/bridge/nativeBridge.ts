/**
 * `postToNative`가 설정(S6) 화면에서도 필요해져 `@/lib/bridge`로 승격했다
 * (`@/lib/userId`와 같은 패턴). 세션 코드는 계속 이 경로로 임포트할 수 있게 re-export만 남긴다.
 */
export { isNativeBridgeAvailable, parseToWebMessage, postToNative } from "@/lib/bridge";
