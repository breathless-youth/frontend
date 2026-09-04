/**
 * 커스텀 엔트리 (BY-586).
 *
 * `expo-router/entry`를 그대로 쓰되, FCM 백그라운드 핸들러를 앱 컴포넌트 밖에서 건다. Android는 앱이
 * 종료된 상태에서 headless로 이 파일만 실행하므로 핸들러가 React 트리 안에 있으면 절대 불리지 않는다.
 * `package.json`의 `main`이 이 파일을 가리킨다.
 */
import "expo-router/entry";

import { registerPushBackgroundHandler } from "./lib/pushBackground";

registerPushBackgroundHandler();
