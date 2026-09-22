package app.shotledger.ringermode

import android.content.Context
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Exposes `AudioManager.getRingerMode()`, which nothing we ship reaches from
 * JS. This module is Android-only on purpose; the README says why.
 */
class RingerModeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShotLedgerRingerMode")

    Function("getRingerMode") {
      val context = appContext.reactContext ?: return@Function "normal"
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      when (audioManager.ringerMode) {
        AudioManager.RINGER_MODE_SILENT -> "silent"
        AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
        else -> "normal"
      }
    }
  }
}
