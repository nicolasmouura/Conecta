/*
 * Cópias locais (AsyncStorage) para o app funcionar sem internet. O
 * Firebase continua sendo a fonte oficial: aqui fica só a última
 * versão recebida de cada dado, apagada ao sair da conta.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Separa as chaves do app das do Firebase (sessão do login).
const PREFIXO = 'conecta:';

// Sem resposta do Firebase nesse tempo, o app segue com a cópia local.
export const TEMPO_LIMITE = 8 * 1000;

export function semConexao(erro) {
  return erro?.message === 'SEM_CONEXAO' || erro?.code === 'unavailable';
}

/*
 * Sem internet, as leituras do Firebase demoram a falhar e as gravações
 * só terminam quando a conexão volta: aqui a espera tem limite e, ao
 * estourar, lança SEM_CONEXAO (a operação original continua valendo).
 */
export function comTempoLimite(promessa, ms = TEMPO_LIMITE) {
  let espera;

  return Promise.race([
    promessa,
    new Promise((_, rejeitar) => {
      espera = setTimeout(() => rejeitar(new Error('SEM_CONEXAO')), ms);
    }),
  ]).finally(() => clearTimeout(espera));
}

// Timestamps do Firestore viram milissegundos (no JSON perderiam o toMillis).
function substituto(chave, valor) {
  const original = this[chave];

  return typeof original?.toMillis === 'function' ? original.toMillis() : valor;
}

// null quando não há cópia (ou ela não pôde ser lida).
export async function lerLocal(chave) {
  try {
    const texto = await AsyncStorage.getItem(PREFIXO + chave);

    return texto === null ? null : JSON.parse(texto);
  } catch (erro) {
    console.log('Cópia local ilegível:', chave, erro.message);
    return null;
  }
}

export async function gravarLocal(chave, valor) {
  try {
    await AsyncStorage.setItem(PREFIXO + chave, JSON.stringify(valor, substituto));
  } catch (erro) {
    console.log('Cópia local não gravada:', chave, erro.message);
  }
}

// Ao sair da conta: nada de uma conta fica para a próxima.
export async function apagarDadosLocais() {
  const chaves = (await AsyncStorage.getAllKeys()).filter((chave) => chave.startsWith(PREFIXO));

  if (chaves.length) {
    await AsyncStorage.multiRemove(chaves);
  }
}

// Listas: os itens do cache do Firebase substituem os da cópia (por id).
function combinar(copia, dados) {
  if (Array.isArray(copia) && Array.isArray(dados)) {
    const porId = new Map(copia.map((item) => [item.id, item]));

    for (const item of dados) {
      porId.set(item.id, item);
    }

    return [...porId.values()];
  }

  return dados ?? copia;
}

/*
 * Listener com cópia local. assinar(aoReceber, onErro) liga o
 * onSnapshot e chama aoReceber(dados, doServidor).
 *
 * A cópia aparece na hora. Sem internet, o Firebase entrega só o que
 * tem em memória (vazio ao abrir o app, ou só as gravações deste
 * aparelho): isso é somado à cópia em vez de apagá-la. O que vem do
 * servidor substitui tudo e vira a nova cópia.
 */
export function observarComCopiaLocal(chave, assinar, callback, onErro) {
  let ativo = true;
  let doServidor = false;
  let mostrouCopia = false;

  const copiaPronta = lerLocal(chave);

  copiaPronta.then((copia) => {
    if (ativo && !doServidor && copia !== null) {
      mostrouCopia = true;
      callback(copia);
    }
  });

  const cancelar = assinar(
    (dados, confirmado) => {
      if (!ativo) return;

      if (confirmado) {
        doServidor = true;
        callback(dados);
        gravarLocal(chave, dados);
        return;
      }

      copiaPronta.then((copia) => {
        if (ativo && !doServidor) {
          callback(copia === null ? dados : combinar(copia, dados));
        }
      });
    },
    (erro) => {
      if (mostrouCopia) {
        console.log('Mostrando a cópia do aparelho:', chave, erro.code || erro.message);
      } else {
        onErro?.(erro);
      }
    }
  );

  return () => {
    ativo = false;
    cancelar();
  };
}
