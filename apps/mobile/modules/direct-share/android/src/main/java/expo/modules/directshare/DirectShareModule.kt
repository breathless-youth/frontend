package expo.modules.directshare

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val INSTAGRAM = "com.instagram.android"
private const val KAKAOTALK = "com.kakao.talk"

// 릴스는 3초보다 짧은 영상을 받지 않는다.
private const val MIN_REELS_MS = 3_000L

class DirectShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DirectShare")

    // 인스타그램 릴스 편집 화면 열기
    //
    // 대상 앱이 넘어간 뒤에 파일을 읽으므로 그 앱에 읽기 권한을 직접 준다.
    // 길이 확인은 파일을 읽어 느릴 수 있어 메인 스레드 밖에서 하고, 앱을 여는 일만 메인 스레드에서 한다.
    AsyncFunction("shareToInstagramReels") Coroutine { uri: String, appId: String ->
      val context = appContext.reactContext ?: return@Coroutine false
      val video = Uri.parse(uri)
      if (durationMs(context, video) < MIN_REELS_MS) {
        return@Coroutine false
      }
      withContext(Dispatchers.Main) {
        val activity = appContext.currentActivity ?: return@withContext false
        val intent = Intent("com.instagram.share.ADD_TO_REEL").apply {
          setDataAndType(video, "video/*")
          putExtra(Intent.EXTRA_STREAM, video)
          putExtra("com.instagram.platform.extra.APPLICATION_ID", appId)
          setPackage(INSTAGRAM)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        if (intent.resolveActivity(activity.packageManager) == null) {
          return@withContext false
        }
        activity.grantUriPermission(INSTAGRAM, video, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.startActivity(intent)
        true
      }
    }

    // 카카오톡 공유 대상 선택 화면 열기
    //
    // 카카오톡이 없으면 클립보드를 건드리지 않고 false를 돌려 공유 시트로 돌아가게 한다.
    // 카카오톡이 파일과 함께 온 글을 버려도 붙여 넣을 수 있게 연 뒤에 본문을 클립보드에 복사한다.
    // 여는 데 실패하면 클립보드를 건드리지 않는다.
    AsyncFunction("shareToKakaoTalk") { uri: String, text: String ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "video/mp4"
        putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
        putExtra(Intent.EXTRA_TEXT, text)
        setPackage(KAKAOTALK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      if (intent.resolveActivity(activity.packageManager) == null) {
        return@AsyncFunction false
      }
      activity.startActivity(intent)
      val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("포커스 메이커스", text))
      true
    }.runOnQueue(Queues.MAIN)
  }

  // 길이를 읽지 못한 파일은 0으로 보고 공유 시트로 돌려보낸다.
  private fun durationMs(context: Context, video: Uri): Long {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(context, video)
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
    } catch (error: RuntimeException) {
      0L
    } finally {
      retriever.release()
    }
  }
}
