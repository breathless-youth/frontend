package expo.modules.profilephotopicker

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.Serializable
import kotlin.math.min

private const val JPEG_QUALITY = 85
// 배경은 1920px라 프로필보다 크다. 브리지 메시지 하나로 보내도록 품질을 조금 낮춘다.
private const val BACKGROUND_JPEG_QUALITY = 80

class ProfilePhotoPickerModule : Module() {
  private lateinit var launcher: AppContextActivityResultLauncher<PickImageInput, Uri?>
  private val single = SinglePick()

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context가 없다" }

  override fun definition() = ModuleDefinition {
    Name("ProfilePhotoPicker")

    RegisterActivityContracts {
      launcher = registerForActivityResult(PickImageContract())
    }

    AsyncFunction("pick") Coroutine { -> pick() }

    AsyncFunction("pickBackground") Coroutine { -> pickBackground() }

    // 선택기가 열린 사이 액티비티가 없어지면 Expo가 늦은 결과를 버려 pick이 끝나지 않으므로, 여는 단계를 취소해 null로 끝낸다.
    OnActivityDestroys { single.cancelOpening() }
  }

  /**
   * 사진 하나 고르기
   *
   * 결과 콜백은 런처마다 하나라서, 고르는 중에 온 호출은 앞 호출의 결과를 가져가지 않도록 바로 null로 끝낸다.
   * 웹은 고르는 동안 사진 버튼을 막으므로 이 경우는 같은 요청이 두 번 온 때뿐이다.
   */
  private suspend fun pick(): String? =
    single.run(
      // 런처는 액티비티를 직접 열어서 메인 스레드에서 불러야 한다.
      open = { withContext(Dispatchers.Main) { launcher.launch(PickImageInput) } },
      finish = { uri -> withContext(Dispatchers.IO) { encodeProfilePhoto(context.contentResolver, uri) } }
    )

  /**
   * 타이머 배경 사진 하나 고르기
   *
   * 프로필 사진과 같은 선택기와 같은 한 번에 하나 규칙을 쓰고, 자르지 않고 줄인 JPEG와 그 크기를 돌려준다.
   */
  private suspend fun pickBackground(): Map<String, Any>? =
    single.run(
      open = { withContext(Dispatchers.Main) { launcher.launch(PickImageInput) } },
      finish = { uri -> withContext(Dispatchers.IO) { encodeBackgroundPhoto(context.contentResolver, uri) } }
    )
}

/** Expo 런처는 입력이 Serializable이어야 해서 입력이 없는 선택기에 빈 입력을 둔다. */
internal object PickImageInput : Serializable {
  private fun readResolve(): Any = PickImageInput
}

/** 시스템 사진 선택기를 이미지 전용으로 연다. 권한 없이 열리고, 선택기가 없는 기기에서는 androidx가 문서 선택기로 대신한다. */
internal class PickImageContract : AppContextActivityResultContract<PickImageInput, Uri?> {
  private val picker = PickVisualMedia()

  override fun createIntent(context: Context, input: PickImageInput): Intent =
    picker.createIntent(
      context,
      PickVisualMediaRequest.Builder().setMediaType(PickVisualMedia.ImageOnly).build()
    )

  override fun parseResult(input: PickImageInput, resultCode: Int, intent: Intent?): Uri? =
    picker.parseResult(resultCode, intent)
}

/**
 * 고른 사진을 512px 정사각형 JPEG base64로 바꾸기
 *
 * 크기만 먼저 읽고 줄여 디코드해 큰 원본을 메모리에 다 올리지 않는다.
 * 가운데 정사각형은 돌리거나 뒤집어도 가운데 정사각형이라, 자르기와 EXIF 방향과 축소를 행렬 하나로 한 번에 그린다.
 * 사진은 파일로 남기지 않고 메모리에서만 다룬다.
 */
internal fun encodeProfilePhoto(resolver: ContentResolver, uri: Uri): String = failOnOutOfMemory {
  val decoded = decodeSampled(resolver, uri, ::sampleSizeFor)
  val side = min(decoded.width, decoded.height)
  val scale = OUTPUT_PX.toFloat() / side
  val matrix = orientationMatrix(readOrientation(resolver, uri)).apply { postScale(scale, scale) }
  val square = Bitmap.createBitmap(
    decoded,
    (decoded.width - side) / 2,
    (decoded.height - side) / 2,
    side,
    side,
    matrix,
    true
  )
  Base64.encodeToString(compressAndRecycle(decoded, square, JPEG_QUALITY), Base64.NO_WRAP)
}

/**
 * 고른 사진을 긴 변 1920px JPEG base64와 그 크기로 바꾸기
 *
 * 프로필 사진처럼 줄여 디코드하고 EXIF 방향과 축소를 행렬 하나로 그리되 자르지 않는다.
 * 사진은 파일로 남기지 않고 메모리에서만 다룬다.
 */
internal fun encodeBackgroundPhoto(resolver: ContentResolver, uri: Uri): Map<String, Any> = failOnOutOfMemory {
  val decoded = decodeSampled(resolver, uri, ::backgroundSampleSizeFor)
  val scale = backgroundScaleFor(decoded.width, decoded.height)
  val matrix = orientationMatrix(readOrientation(resolver, uri)).apply { postScale(scale, scale) }
  val upright = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
  val width = upright.width
  val height = upright.height
  val bytes = compressAndRecycle(decoded, upright, BACKGROUND_JPEG_QUALITY)
  mapOf("data" to Base64.encodeToString(bytes, Base64.NO_WRAP), "width" to width, "height" to height)
}

/** 크기만 먼저 읽고, 주어진 배율로 줄여 디코드한다. 큰 원본을 메모리에 다 올리지 않기 위해서다. */
private fun decodeSampled(resolver: ContentResolver, uri: Uri, sampleSize: (Int, Int) -> Int): Bitmap {
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  open(resolver, uri).use { BitmapFactory.decodeStream(it, null, bounds) }
  if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
    throw IOException("사진 크기를 읽지 못했다")
  }
  val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight) }
  return open(resolver, uri).use { BitmapFactory.decodeStream(it, null, options) }
    ?: throw IOException("사진을 디코드하지 못했다")
}

/** 변환한 비트맵을 JPEG 바이트로 바꾸고 두 비트맵을 모두 해제한다. */
private fun compressAndRecycle(decoded: Bitmap, transformed: Bitmap, quality: Int): ByteArray {
  // 변환이 없으면 createBitmap이 원본을 그대로 돌려주므로 같은 객체는 한 번만 해제한다.
  if (transformed !== decoded) {
    decoded.recycle()
  }
  val bytes = try {
    ByteArrayOutputStream().use { out ->
      if (!transformed.compress(Bitmap.CompressFormat.JPEG, quality, out)) {
        throw IOException("JPEG로 바꾸지 못했다")
      }
      out.toByteArray()
    }
  } finally {
    transformed.recycle()
  }
  if (bytes.isEmpty()) {
    throw IOException("JPEG가 비었다")
  }
  return bytes
}

private fun open(resolver: ContentResolver, uri: Uri): InputStream =
  resolver.openInputStream(uri) ?: throw IOException("사진을 열지 못했다")

/** 방향 값이 없는 사진(스크린샷, PNG)은 돌리지 않는다. */
private fun readOrientation(resolver: ContentResolver, uri: Uri): Int =
  try {
    open(resolver, uri).use {
      ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    }
  } catch (e: Exception) {
    ExifInterface.ORIENTATION_NORMAL
  }

/** EXIF 방향 값 8가지를 사진이 똑바로 서는 변환으로 바꾼다. */
private fun orientationMatrix(orientation: Int): Matrix = Matrix().apply {
  when (orientation) {
    ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
    ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
    ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
    ExifInterface.ORIENTATION_TRANSPOSE -> {
      setRotate(90f)
      postScale(-1f, 1f)
    }
    ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
    ExifInterface.ORIENTATION_TRANSVERSE -> {
      setRotate(-90f)
      postScale(-1f, 1f)
    }
    ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
  }
}
