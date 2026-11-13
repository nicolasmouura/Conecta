package expo.modules.conectasms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/*
 * Envio de SMS sem abrir o app de mensagens (só o SOS usa). Precisa da
 * permissão SEND_SMS, pedida pelo JavaScript antes da emergência.
 * O SMS não usa internet: sem sinal de celular, o próprio sistema
 * segura a mensagem e a envia quando o sinal voltar.
 */
class ConectaSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ConectaSms")

    Function("temPermissao") {
      val contexto = appContext.reactContext
      contexto != null &&
        contexto.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
    }

    // Um SMS (em partes, se longo) para cada telefone. Um número que
    // falha não impede os outros: devolve quantos saíram e quais falharam.
    AsyncFunction("enviar") { telefones: List<String>, mensagem: String ->
      val contexto = appContext.reactContext
        ?: throw IllegalStateException("Sem contexto do aplicativo")

      val gerente = gerenteDeSms(contexto)
      val partes = gerente.divideMessage(mensagem)

      var enviados = 0
      val falhas = mutableListOf<String>()

      for (telefone in telefones) {
        try {
          gerente.sendMultipartTextMessage(telefone, null, partes, null, null)
          enviados++
        } catch (erro: Exception) {
          falhas.add(telefone)
        }
      }

      mapOf("enviados" to enviados, "falhas" to falhas)
    }
  }

  private fun gerenteDeSms(contexto: Context): SmsManager =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      contexto.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    }
}
