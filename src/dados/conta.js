import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

import { auth, db } from '../config/firebase';
import { sairDaFamilia } from './grupo';
import { chaveDiretorio } from './salvarUsuario';

// Um lote do Firestore aceita até 500 gravações.
const TAMANHO_LOTE = 400;

async function apagarTodos(consulta) {
  const resultado = await getDocs(consulta);

  for (let inicio = 0; inicio < resultado.docs.length; inicio += TAMANHO_LOTE) {
    const lote = writeBatch(db);

    resultado.docs.slice(inicio, inicio + TAMANHO_LOTE).forEach((documento) => {
      lote.delete(documento.ref);
    });

    await lote.commit();
  }

  return resultado.size;
}

/*
 * Excluir a conta (Configurações → Excluir conta). Apaga TUDO o que é
 * da pessoa e, por último, o login:
 *   1. confere a senha no Firebase (precisa de internet; o Firebase
 *      também exige um login recente para apagar a conta);
 *   2. alertas de SOS (antes de sair: SOS ativo impede a saída);
 *   3. sai da família (administração passa adiante / família apagada);
 *   4. histórico, lugares, convites enviados e recebidos, índice de
 *      convites, localização no mapa;
 *   5. perfil e CPF (juntos, como as regras exigem);
 *   6. o login (Firebase Authentication).
 * Cada passo pode ser repetido: se algo falhar no meio (ex.: internet
 * caiu), tentar de novo continua de onde parou.
 */
export async function excluirConta(senha) {
  const usuario = auth.currentUser;

  if (!usuario) throw Object.assign(new Error('auth/no-current-user'), { code: 'auth/no-current-user' });

  await reauthenticateWithCredential(usuario, EmailAuthProvider.credential(usuario.email, senha));

  const { uid, email } = usuario;
  const referenciaPerfil = doc(db, 'usuarios', uid);
  const perfil = await getDoc(referenciaPerfil);
  const dados = perfil.exists() ? perfil.data() : {};

  await apagarTodos(query(collection(db, 'alertasSOS'), where('uid', '==', uid)));

  if (dados.grupoId) {
    await sairDaFamilia(uid);
  }

  await apagarTodos(collection(db, 'historicoLocalizacoes', uid, 'pontos'));
  await apagarTodos(collection(db, 'usuarios', uid, 'lugares'));
  await apagarTodos(collection(db, 'usuarios', uid, 'conquistas'));
  await apagarTodos(query(collection(db, 'convites'), where('deUid', '==', uid)));
  await apagarTodos(query(collection(db, 'convites'), where('paraEmail', '==', email.toLowerCase())));

  const lote = writeBatch(db);
  const chave = chaveDiretorio(dados.nome, email);

  if (chave) {
    const entrada = await getDoc(doc(db, 'diretorioConvites', chave));

    if (entrada.exists() && entrada.data().uid === uid) {
      lote.delete(entrada.ref);
    }
  }

  lote.delete(doc(db, 'familiares', uid));

  if (perfil.exists()) {
    lote.delete(doc(db, 'usuarios', uid, 'privado', 'documentos'));
    lote.delete(referenciaPerfil);
  }

  await lote.commit();

  await deleteUser(usuario);

  console.log('Conta excluída:', uid);
}
