package expo.modules.profilephotopicker

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import java.util.concurrent.atomic.AtomicReference

/**
 * 한 번에 하나만 도는 선택 흐름
 *
 * 선택기를 여는 단계를 자식 코루틴으로 두어 그 단계만 밖에서 취소할 수 있게 한다.
 * 그 자식이 곧 이번 호출의 표시라서, 표시는 그것을 건 호출만 풀 수 있고 늦게 끝난 앞 호출이 새 호출의 표시를 풀지 못한다.
 */
internal class SinglePick {
  private val current = AtomicReference<Job?>(null)

  /**
   * 선택기 열기부터 고른 결과 처리까지 한 번 실행하기
   *
   * 앞 호출이 끝나지 않았으면 null이고, 여는 단계가 cancelOpening으로 취소돼도 null이다.
   * 호출한 쪽이 취소되면 null로 바꾸지 않고 취소를 그대로 올린다.
   */
  suspend fun <T : Any, R> run(open: suspend () -> T?, finish: suspend (T) -> R): R? = coroutineScope {
    // 표시를 건 뒤에 시작해야, 걸기 전에 취소 요청이 와도 놓치지 않는다.
    val opening = async(start = CoroutineStart.LAZY) { open() }
    if (!current.compareAndSet(null, opening)) {
      opening.cancel()
      return@coroutineScope null
    }
    try {
      val picked = try {
        opening.await()
      } catch (e: CancellationException) {
        ensureActive()
        null
      }
      picked?.let { finish(it) }
    } finally {
      current.compareAndSet(opening, null)
    }
  }

  /**
   * 여는 단계 취소
   *
   * 마무리 단계는 결과를 이미 받았으므로 멈추지 않는다.
   */
  fun cancelOpening() {
    current.get()?.cancel()
  }
}
