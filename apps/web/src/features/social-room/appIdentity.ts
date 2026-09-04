/**
 * 웹이 앱을 열 때 쓰는 스킴과 Android 패키지. 앱 쪽 app.config.ts의 변형 표와 짝이다.
 * 웹 preview(web-dev)는 staging 앱, 로컬 Vite는 Dev Client와 맞물린다. 같은 스킴을 두 앱이
 * 등록하면 어느 앱이 열릴지 OS가 보장하지 않아 환경마다 다른 스킴을 쓴다.
 *
 * 앱 쪽 표는 `apps/mobile/app.config.ts`의 `VARIANT_TABLE`(`schemes`, `idSuffix`)이다.
 * 한쪽을 바꾸면 다른 쪽도 같이 바꾼다.
 */
export type DeployEnv = typeof __DEPLOY_ENV__;

export type AppIdentity = { scheme: string; androidPackage: string };

const BASE_PACKAGE = "com.breathlessyouth.mobile";

const IDENTITY_BY_ENV: Record<DeployEnv, AppIdentity> = {
  production: { scheme: "focusmakers", androidPackage: BASE_PACKAGE },
  preview: { scheme: "focusmakers-staging", androidPackage: `${BASE_PACKAGE}.staging` },
  development: { scheme: "focusmakers-dev", androidPackage: `${BASE_PACKAGE}.dev` },
};

export function appIdentityFor(env: DeployEnv): AppIdentity {
  return IDENTITY_BY_ENV[env];
}

export const APP_IDENTITY: AppIdentity = appIdentityFor(__DEPLOY_ENV__);
