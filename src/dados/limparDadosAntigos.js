import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/*
 * Apaga o que sobrou da fase em que o app guardava tudo só no aparelho
 * (bancoLocal/contasLocais, antes da volta ao Firebase): documentos,
 * contas, sessão e as senhas dessas contas no SecureStore. Esses dados
 * eram de teste e não vão para o Firebase. Roda a cada abertura e não
 * faz nada quando já não há resto.
 */
const PREFIXO_BANCO = '@conecta:banco:';
const CHAVE_CONTAS = '@conecta:contas';
const CHAVE_SESSAO = '@conecta:sessao';

export async function limparDadosAntigos() {
  const chaves = (await AsyncStorage.getAllKeys()).filter(
    (chave) =>
      chave.startsWith(PREFIXO_BANCO) || chave === CHAVE_CONTAS || chave === CHAVE_SESSAO
  );

  if (!chaves.length) return 0;

  let contas = {};

  try {
    contas = JSON.parse((await AsyncStorage.getItem(CHAVE_CONTAS)) || '{}') || {};
  } catch {
    // Lista de contas ilegível: apaga mesmo assim.
  }

  for (const conta of Object.values(contas)) {
    if (conta?.uid) {
      await SecureStore.deleteItemAsync(`conecta.senha.${conta.uid}`).catch(() => {});
    }
  }

  await AsyncStorage.multiRemove(chaves);

  console.log('Dados locais antigos apagados:', chaves.length);

  return chaves.length;
}
