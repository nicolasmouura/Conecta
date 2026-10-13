import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

/*
 * Conferir a senha da conta SEM internet (encerrar o SOS).
 *
 * A cada login, cadastro ou senha conferida no Firebase, guarda no
 * SecureStore (criptografado pelo sistema) só um hash SHA-256 com sal
 * da senha da conta aberta: a senha em si nunca é guardada. Com
 * internet, quem confere é sempre o Firebase; o hash só é usado quando
 * o Firebase não responde (auth/network-request-failed).
 */

// Chaves do SecureStore aceitam apenas letras, números, ".", "-" e "_".
const CHAVE = 'conecta.senhaOffline';

function erroAuth(codigo) {
  const erro = new Error(codigo);
  erro.code = codigo;
  return erro;
}

function paraHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function calcularHash(sal, senha) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${sal}:${senha}`);
}

export async function guardarSenhaOffline(uid, senha) {
  if (!uid || !senha) return;

  const sal = paraHex(Crypto.getRandomBytes(16));
  const hash = await calcularHash(sal, senha);

  await SecureStore.setItemAsync(CHAVE, JSON.stringify({ uid, sal, hash }));
}

// "Sair": a próxima conta guarda o próprio hash ao entrar.
export async function apagarSenhaOffline() {
  await SecureStore.deleteItemAsync(CHAVE);
}

// true / false; null quando não há hash desta conta no aparelho.
export async function conferirSenhaOffline(uid, senha) {
  const texto = await SecureStore.getItemAsync(CHAVE);

  if (!texto) return null;

  let salvo;

  try {
    salvo = JSON.parse(texto);
  } catch {
    return null;
  }

  if (!salvo || salvo.uid !== uid || !salvo.sal || !salvo.hash) return null;

  return (await calcularHash(salvo.sal, senha)) === salvo.hash;
}

/*
 * Confere a senha da conta aberta, com ou sem internet. Senha errada
 * lança auth/invalid-credential (online ou offline). Sem internet e sem
 * hash guardado, lança o auth/network-request-failed original.
 */
export async function confirmarSenhaDaConta(usuario, senha) {
  if (!usuario?.uid || !usuario.email) throw erroAuth('auth/user-mismatch');
  if (!senha) throw erroAuth('auth/missing-password');

  try {
    await reauthenticateWithCredential(
      usuario,
      EmailAuthProvider.credential(usuario.email, senha)
    );
  } catch (erro) {
    if (erro?.code !== 'auth/network-request-failed') throw erro;

    const confere = await conferirSenhaOffline(usuario.uid, senha);

    if (confere === null) throw erro;
    if (!confere) throw erroAuth('auth/invalid-credential');

    return 'offline';
  }

  // Senha confirmada pelo Firebase: atualiza o hash (ex.: senha trocada).
  await guardarSenhaOffline(usuario.uid, senha).catch((erro) =>
    console.log('Hash da senha não atualizado:', erro.message)
  );

  return 'online';
}
