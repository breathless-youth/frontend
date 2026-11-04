package expo.modules.googledeferredlink

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * GA4 SDK가 받은 구글 지연 딥링크 읽기
 *
 * 매니페스트 플래그가 켜져 있으면 SDK가 첫 실행에서 광고 그룹의 딥링크를 받아 이 SharedPreferences에 저장한다.
 * RN Firebase에는 이 값을 읽는 API가 없어서 저장된 값을 직접 읽는다.
 * 저장은 비동기라 첫 호출에는 비어 있을 수 있고, 다시 묻는 일은 JS가 맡는다.
 */
class GoogleDeferredLinkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GoogleDeferredLink")

    Function("readDeepLink") {
      val context = appContext.reactContext ?: return@Function null
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(KEY_DEEP_LINK, null)
    }
  }

  private companion object {
    const val PREFS_NAME = "google.analytics.deferred.deeplink.prefs"
    const val KEY_DEEP_LINK = "deeplink"
  }
}
