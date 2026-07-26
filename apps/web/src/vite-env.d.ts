/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 origin. 미설정 시 same-origin(개발은 Vite 프록시 경유). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
