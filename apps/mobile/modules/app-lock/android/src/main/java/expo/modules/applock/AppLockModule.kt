package expo.modules.applock

import android.app.AppOpsManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException

private const val ICON_PX = 96

class AppLockModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context가 없다" }

  override fun definition() = ModuleDefinition {
    Name("AppLock")

    Function("hasUsageAccess") { hasUsageAccess(context) }

    Function("canDrawOverlays") { Settings.canDrawOverlays(context) }

    Function("openUsageAccessSettings") {
      openSettings(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    // 패키지 주소를 실어야 목록이 아니라 이 앱의 허용 화면이 바로 열린다.
    Function("openOverlaySettings") {
      openSettings(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
      )
    }

    // 예외를 직접 요청하는 권한은 Play 정책상 쓰지 않아서 사용자가 배터리 설정을 고를 앱 정보 화면을 연다.
    // 배터리 최적화 목록은 기본 필터가 최적화하지 않은 앱이라 삼성에서 이 앱이 보이지 않는다.
    Function("openAppBatterySettings") {
      try {
        openSettings(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
        )
      } catch (e: ActivityNotFoundException) {
        openSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
    }

    // 아이콘을 그려 인코딩하는 데 앱 수만큼 시간이 걸려 메인 스레드 밖에서 만든다.
    AsyncFunction("getLaunchableApps") Coroutine { ->
      withContext(Dispatchers.Default) { launchableApps(context) }
    }

    Function("getSelectedPackages") { AppLockPrefs.selected(context).toList() }

    Function("setSelectedPackages") { packages: List<String> ->
      AppLockPrefs.save(context, packages.toSet())
    }

    // 앱이 앞에 있을 때 공부를 시작하므로 포그라운드 서비스 시작 제한에 걸리지 않는다.
    // 걸리면 예외가 JS로 넘어가 잠그지 않은 것으로 처리된다.
    Function("startLock") { durationMs: Double ->
      val count = AppLockPrefs.selected(context).size
      if (count == 0 || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        return@Function 0
      }
      val intent = Intent(context, AppLockService::class.java)
        .putExtra(AppLockService.EXTRA_DURATION_MS, durationMs.toLong())
        .putExtra(AppLockService.EXTRA_COUNT, count)
      val generation = AppLockService.requests.start()
      try {
        context.startForegroundService(intent.putExtra(AppLockService.EXTRA_GENERATION, generation))
      } catch (e: Exception) {
        AppLockService.requests.rollback(generation)
        throw e
      }
      count
    }

    // stopService로 바로 내리면 아직 startForeground를 부르지 않은 서비스를 Android가 앱째 죽여서, 해제도 명령으로 보내 시작 뒤에 처리하게 한다.
    // 서비스가 돌고 있으면 앱이 뒤에 있어도 startService가 허용된다.
    // 그래도 막혔다면 서비스가 이미 끝난 것이라 멈출 것이 없다.
    Function("stopLock") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && AppLockService.requests.stop()) {
        try {
          context.startService(Intent(context, AppLockService::class.java).setAction(AppLockService.ACTION_STOP))
        } catch (e: IllegalStateException) {
        }
      }
    }
  }

  private fun openSettings(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}

internal fun hasUsageAccess(context: Context): Boolean {
  val appOps = context.getSystemService(AppOpsManager::class.java)
  // 두 함수 모두 최신 SDK에서 deprecated지만 대체 함수가 이 앱의 최소 버전에 없다.
  @Suppress("DEPRECATION")
  val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
  } else {
    appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
  }
  // 일부 기기는 허용해도 기본값으로 남기고 권한 부여로만 표시한다.
  if (mode == AppOpsManager.MODE_DEFAULT) {
    return context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) ==
      PackageManager.PERMISSION_GRANTED
  }
  return mode == AppOpsManager.MODE_ALLOWED
}

/** 기본으로 정한 홈 앱이 없으면 시스템 선택 창의 패키지가 돌아와 어떤 홈 앱도 빼지 않는다. */
internal fun defaultHomePackage(context: Context): String? =
  context.packageManager
    .resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)
    ?.activityInfo
    ?.packageName

private fun launcherActivities(context: Context) =
  context.packageManager
    .queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
    .distinctBy { it.activityInfo.packageName }

private fun launchableApps(context: Context): List<Map<String, String>> {
  val pm = context.packageManager
  val apps = launcherActivities(context)
  val allowed = lockable(apps.map { it.activityInfo.packageName }.toSet(), defaultHomePackage(context), context.packageName)
  return apps
    .filter { it.activityInfo.packageName in allowed }
    .map {
      mapOf(
        "packageName" to it.activityInfo.packageName,
        "label" to it.loadLabel(pm).toString(),
        "iconBase64" to iconPng(it.loadIcon(pm)),
      )
    }
    .sortedBy { it["label"] }
}

private fun iconPng(drawable: Drawable): String {
  val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
  drawable.setBounds(0, 0, ICON_PX, ICON_PX)
  drawable.draw(Canvas(bitmap))
  val out = ByteArrayOutputStream()
  bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
  bitmap.recycle()
  return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

/**
 * 고른 앱 목록 저장
 *
 * 이 기기 안에만 두고 웹에는 개수만 넘긴다.
 * 앱의 자동 백업 규칙이 SharedPreferences를 통째로 클라우드 백업과 기기 이전에 실어서, 앱 설정을 건드리지 않고 백업에서 빠지는 noBackupFilesDir에 한 줄에 하나씩 적는다.
 * 읽을 때 지운 앱은 목록에서 지우고, 기본 홈 앱과 이 앱은 빼서 예전에 고른 목록이 남아 있어도 잠그지 않는다.
 * 홈 앱은 다시 바뀔 수 있어 저장 목록에서는 지우지 않는다.
 */
internal object AppLockPrefs {
  private const val FILE_NAME = "app_lock_packages"

  fun selected(context: Context): Set<String> {
    val file = File(context.noBackupFilesDir, FILE_NAME)
    val stored = if (file.exists()) file.readLines().filter { it.isNotBlank() }.toSet() else emptySet()
    val installed = installedOnly(stored, launcherActivities(context).map { it.activityInfo.packageName }.toSet())
    // 지운 앱 정리는 다음에 읽을 때 다시 하므로, 저장에 실패해도 읽기는 그대로 마쳐 잠금 서비스가 죽지 않게 한다.
    if (installed != stored) {
      try {
        save(context, installed)
      } catch (e: IOException) {
      }
    }
    return lockable(installed, defaultHomePackage(context), context.packageName)
  }

  // 쓰다가 앱이 죽어도 목록이 반만 남지 않게 임시 파일에 다 쓴 뒤 이름을 바꾼다.
  // 이름을 바꾸지 못하면 예전 목록이 그대로라 저장한 것으로 넘기지 않고 예외를 던진다.
  fun save(context: Context, packages: Set<String>) {
    val temp = File(context.noBackupFilesDir, "$FILE_NAME.tmp")
    temp.writeText(packages.joinToString("\n"))
    if (!temp.renameTo(File(context.noBackupFilesDir, FILE_NAME))) throw IOException("고른 앱 목록을 저장하지 못했다")
  }
}
