/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN. 미설정 시 Sentry는 초기화되지 않는다(로컬 개발·테스트). */
  readonly VITE_SENTRY_DSN?: string;
  /** GA4 측정 ID(G-XXXXXXXXXX). 미설정 시 GA4는 초기화되지 않는다(로컬 개발·테스트). */
  readonly VITE_GA4_MEASUREMENT_ID?: string;
  /** Amplitude API 키. 미설정 시 Amplitude는 초기화되지 않는다(로컬 개발·테스트). */
  readonly VITE_AMPLITUDE_API_KEY?: string;
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
