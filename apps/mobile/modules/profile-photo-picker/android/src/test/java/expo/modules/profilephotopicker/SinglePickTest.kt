package expo.modules.profilephotopicker

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class SinglePickTest {
  @Test
  fun 여는_중에_취소되면_null로_끝나고_다음_호출을_받는다() = runBlocking {
    val gate = SinglePick()
    val opened = CompletableDeferred<Unit>()
    val call = async {
      gate.run<String, String>({ opened.complete(Unit); awaitCancellation() }) { "photo:$it" }
    }
    opened.await()
    gate.cancelOpening()
    assertNull(call.await())
    assertEquals("photo:b", gate.run({ "b" }) { "photo:$it" })
  }

  @Test
  fun 여는_중에_온_두번째_호출은_바로_null이고_첫_호출은_이어간다() = runBlocking {
    val gate = SinglePick()
    val opened = CompletableDeferred<Unit>()
    val picked = CompletableDeferred<String>()
    val first = async {
      gate.run({ opened.complete(Unit); picked.await() }) { "photo:$it" }
    }
    opened.await()
    assertNull(gate.run({ "other" }) { "photo:$it" })
    picked.complete("a")
    assertEquals("photo:a", first.await())
  }

  @Test
  fun 마무리_중의_취소는_마무리를_멈추지_않는다() = runBlocking {
    val gate = SinglePick()
    val finishing = CompletableDeferred<Unit>()
    val proceed = CompletableDeferred<Unit>()
    val call = async {
      gate.run({ "a" }) { finishing.complete(Unit); proceed.await(); "photo:$it" }
    }
    finishing.await()
    gate.cancelOpening()
    proceed.complete(Unit)
    assertEquals("photo:a", call.await())
  }

  @Test
  fun 호출한_쪽의_취소는_null로_바꾸지_않고_표시를_푼다() = runBlocking {
    val gate = SinglePick()
    val opened = CompletableDeferred<Unit>()
    val call = async {
      gate.run<String, String>({ opened.complete(Unit); awaitCancellation() }) { it }
    }
    opened.await()
    call.cancel()
    assertTrue(runCatching { call.await() }.exceptionOrNull() is CancellationException)
    assertEquals("b", gate.run({ "b" }) { it })
  }

  @Test
  fun 여는_단계의_실패는_그대로_올리고_표시를_푼다() = runBlocking {
    val gate = SinglePick()
    val failure = runCatching { gate.run<String, String>({ throw IOException("x") }) { it } }.exceptionOrNull()
    assertTrue(failure is IOException)
    assertEquals("b", gate.run({ "b" }) { it })
  }
}
