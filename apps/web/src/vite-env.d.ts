/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN. 미설정 시 Sentry는 초기화되지 않는다(로컬 개발·테스트). */
  readonly VITE_SENTRY_DSN?: string;
  /** GA4 측정 ID(G-XXXXXXXXXX). 미설정 시 GA4는 초기화되지 않는다(로컬 개발·테스트). */
  readonly VITE_GA4_MEASUREMENT_ID?: string;
  /** Amplitude API 키. 미설정 시 Amplitude는 초기화되지 않는다(로컬 개발·테스트). */
  readonly VITE_AMPLITUDE_API_KEY?: string;
  /** 측정용 전 빌드 전용. "off"면 홈에서 Vision 자원을 미리 받지 않는다. */
  readonly VITE_VISION_PREFETCH?: string;
  /** 측정용 전 빌드 전용. "off"면 Vision 추론을 워커 대신 메인 스레드에서 돌린다. */
  readonly VITE_VISION_WORKER?: string;
  /**
   * 측정 빌드 전용. "1"이면 세션 화면에 `VisionPerfPanel`을 띄운다. 운영 빌드에서는 비어 있어
   * 호출부 조건이 false로 접히고 패널이 번들에서 빠진다.
   */
  readonly VITE_PERF_PANEL?: string;
  /**
   * 측정 빌드 전용. "1"이면 `getUserMedia`를 캔버스 영상으로 바꿔 카메라 없는 iOS
   * 시뮬레이터에서도 검출기가 로딩된다. 운영 빌드에서는 비어 있어 호출부 조건이 false로
   * 접히고 이 코드가 번들에서 빠진다.
   */
  readonly VITE_FAKE_CAMERA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * 배포 환경 — `vite.config.ts`의 `define`이 Vercel 시스템 변수 `VERCEL_ENV`를 빌드 타임에
 * 박아 넣는다. `import.meta.env.MODE`는 Preview·Production을 구분하지 못해 쓸 수 없다.
 */
declare const __DEPLOY_ENV__: "production" | "preview" | "development";

/** 배포 커밋 SHA 7자리. 로컬 빌드는 `"local"`. */
declare const __RELEASE__: string;

/**
 * 빌드 타임에 결정된 API 베이스(scripts/resolveApiBase.ts의 define 주입).
 * 로컬 개발·테스트는 빈 값 — same-origin으로 나가 Vite 프록시가 전달한다.
 */
declare const __API_BASE__: string;

/** 웹 자체 버전 `YY.WW.P`. `package.json`의 `version`을 빌드 타임에 주입한다. */
declare const __WEB_VERSION__: string;

/** 설치된 `@mediapipe/tasks-vision` 버전. wasm 폴더 이름이라 `MEDIAPIPE_WASM_PATH`가 이 값으로 경로를 조립한다. */
declare const __MEDIAPIPE_VERSION__: string;
