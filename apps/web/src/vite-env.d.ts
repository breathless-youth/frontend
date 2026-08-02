/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 origin. 미설정 시 same-origin(개발은 Vite 프록시 경유). */
  readonly VITE_API_BASE_URL?: string;
  /** Sentry DSN. 미설정 시 Sentry는 초기화되지 않는다(로컬 개발·테스트). */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
