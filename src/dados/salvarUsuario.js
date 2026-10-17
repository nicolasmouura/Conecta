/*
 * Perfil do usuário (usuarios/{uid}): cadastro, leitura, edição, foto,
 * CPF na área privada, índice de convites e validações (CPF, telefone,
 * cadastro).
 */

import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

import { auth, db } from '../config/firebase';
import { MODO_DEMO, perfisDemo, separarUidsDemo } from '../demo/demonstracao';

// Limites dos campos editáveis (também conferidos no firestore.rules).
export const LIMITES_PERFIL = {
  nome: 60,
  telefone: 20,
};

/*
 * CPF: fica em usuarios/{uid}/privado/documentos ({ cpf }), que só o
 * dono lê (firestore.rules). O perfil usuarios/{uid} é lido pela
 * família, então nunca leva o CPF.
 *
 * Um CPF = uma conta: cpfs/{11 números} → { uid }. As regras só deixam
 * criar se estiver livre, e a leitura só responde "livre" ou "é seu"
 * (de outra pessoa é recusada).
 */
function referenciaDocumentos(uid) {
  return doc(db, 'usuarios', uid, 'privado', 'documentos');
}

function referenciaCpf(cpf) {
  return doc(db, 'cpfs', cpf.replace(/\D/g, ''));
}

// Lança CPF_JA_CADASTRADO se o CPF já é de outra conta.
async function garantirCpfLivre(cpf) {
  let dono;

  try {
    dono = await getDoc(referenciaCpf(cpf));
  } catch (erro) {
    if (erro.code === 'permission-denied') throw new Error('CPF_JA_CADASTRADO');
    throw erro;
  }

  if (dono.exists() && dono.data().uid !== auth.currentUser?.uid) {
    throw new Error('CPF_JA_CADASTRADO');
  }
}

// CPF do próprio usuário ('' se não tiver). Só o dono consegue ler.
async function buscarDocumento(uid) {
  const privado = await getDoc(referenciaDocumentos(uid));

  return privado.exists() ? privado.data().cpf || '' : '';
}

/*
 * Índice para convites: diretorioConvites/{nome|email} → { uid }.
 * Só quem sabe o nome completo E o e-mail cadastrados chega ao uid
 * (leitura exata; listar é proibido pelas regras). A mesma
 * normalização existe no firestore.rules (nomeNormalizado).
 */
export function normalizarNome(nome) {
  return (nome || '').toLowerCase().replace(/[ \t]+/g, ' ').trim();
}

export function normalizarEmailCadastro(email) {
  return (email || '').trim().toLowerCase();
}

// null quando não é possível montar uma chave válida.
export function chaveDiretorio(nome, email) {
  const nomeNormalizado = normalizarNome(nome);
  const emailNormalizado = normalizarEmailCadastro(email);

  if (!nomeNormalizado || !emailNormalizado) return null;

  const chave = `${nomeNormalizado}|${emailNormalizado}`;

  return chave.includes('/') ? null : chave;
}

function referenciaDiretorio(chave) {
  return doc(db, 'diretorioConvites', chave);
}

// O índice só aceita e-mail confirmado (firestore.rules): sem isso,
// alguém poderia "ocupar" o e-mail de outra pessoa e receber os
// convites dela. Antes de confirmar, a entrada fica para depois
// (garantirEntradaDiretorio, ao liberar o app).
function emailConfirmado() {
  return auth.currentUser?.emailVerified === true;
}

// Adiciona ao lote a entrada do próprio usuário no índice (se faltar).
async function incluirNoDiretorio(lote, uid, nome, email) {
  if (!emailConfirmado()) return;

  const chave = chaveDiretorio(nome, email);

  if (!chave) return;

  const entrada = await getDoc(referenciaDiretorio(chave));

  if (!entrada.exists()) {
    lote.set(referenciaDiretorio(chave), { uid });
  }
}

/*
 * A entrada no índice exige e-mail confirmado, que o cadastro ainda
 * não tem: ela é criada quando a pessoa entra no app já confirmada
 * (App.js). Se já existir, não faz nada.
 */
export async function garantirEntradaDiretorio(uid) {
  const usuarioAtual = auth.currentUser;

  if (!usuarioAtual || usuarioAtual.uid !== uid) return;

  const perfil = await getDoc(doc(db, 'usuarios', uid));

  if (!perfil.exists() || !perfil.data().nome) return;

  const lote = writeBatch(db);

  await incluirNoDiretorio(lote, uid, perfil.data().nome, usuarioAtual.email);
  await lote.commit();
}

/*
 * Cadastro: cria usuarios/{uid} com os dados pessoais e, à parte, o
 * CPF (área privada + índice de CPFs), tudo no mesmo lote. O endereço
 * não vem aqui: é cadastrado depois, em Meu Perfil (a Casa).
 * Lança CPF_JA_CADASTRADO se o CPF já tem conta.
 * A senha nunca passa por aqui: é do Firebase Authentication.
 */
export async function salvarPerfilUsuario(usuario) {
  const cpf = formatarCPF(usuario.cpf);

  await garantirCpfLivre(cpf);

  const perfil = {
    nome: usuario.nome.trim(),
    email: usuario.email,
    uid: usuario.uid,
    criadoEm: new Date().toISOString(),
  };

  if (usuario.telefone) perfil.telefone = formatarTelefone(usuario.telefone);

  const lote = writeBatch(db);

  lote.set(doc(db, 'usuarios', usuario.uid), perfil);
  lote.set(referenciaDocumentos(usuario.uid), { cpf });
  lote.set(referenciaCpf(cpf), { uid: usuario.uid });
  await incluirNoDiretorio(lote, usuario.uid, perfil.nome, auth.currentUser?.email || usuario.email);

  try {
    await lote.commit();
  } catch (erro) {
    // Outra conta pegou o CPF entre a conferência e a gravação.
    await garantirCpfLivre(cpf);
    throw erro;
  }

  console.log('Perfil salvo:', usuario.uid);
}

/*
 * usuarios/{uid} é a fonte principal dos dados pessoais. Campos ainda
 * não preenchidos (ex.: endereço, antes de cadastrar a Casa) voltam
 * como texto vazio (enderecoDetalhado: null).
 */
function normalizarPerfil(uid, dados = {}) {
  return {
    ...dados,
    uid,
    nome: dados.nome || '',
    email: dados.email || '',
    telefone: dados.telefone || '',
    documento: dados.documento || '',
    endereco: dados.endereco || '',
    enderecoDetalhado: dados.enderecoDetalhado || null,
  };
}

// O próprio perfil vem com o CPF (área privada); o de outra pessoa, sem.
export async function buscarPerfil(uid) {
  const resultado = await getDoc(doc(db, 'usuarios', uid));
  const dados = resultado.exists() ? resultado.data() : {};

  if (auth.currentUser?.uid === uid) {
    return normalizarPerfil(uid, { ...dados, documento: await buscarDocumento(uid) });
  }

  return normalizarPerfil(uid, dados);
}

// Perfis dos membros da família. Um perfil que não puder
// ser lido não impede os demais de aparecerem.
export async function buscarPerfisDosMembros(uids) {
  // Modo demonstração: perfis fictícios sem ir ao Firebase.
  if (MODO_DEMO) {
    const { reais, fakes } = separarUidsDemo(uids);

    return { ...(await buscarPerfisReais(reais)), ...perfisDemo(fakes) };
  }

  return buscarPerfisReais(uids);
}

async function buscarPerfisReais(uids) {
  const perfis = await Promise.all(
    uids.map(async (uid) => {
      try {
        const resultado = await getDoc(doc(db, 'usuarios', uid));

        // O CPF fica na área privada: nunca vem para a família.
        return resultado.exists() ? normalizarPerfil(uid, resultado.data()) : null;
      } catch (erro) {
        console.error('Erro ao buscar perfil do membro:', uid, erro);
        return null;
      }
    })
  );

  return Object.fromEntries(
    uids.map((uid, indice) => [uid, perfis[indice]])
  );
}

function formatarTelefone(telefone) {
  const digitos = telefone.replace(/\D/g, '');

  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }

  return telefone.trim();
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// CPF com dígitos verificadores válidos (aceita com ou sem pontuação).
export function cpfValido(cpf) {
  const digitos = (cpf || '').replace(/\D/g, '');

  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  const verificador = (quantidade) => {
    let soma = 0;

    for (let i = 0; i < quantidade; i++) {
      soma += Number(digitos[i]) * (quantidade + 1 - i);
    }

    const resto = (soma * 10) % 11;

    return resto === 10 ? 0 : resto;
  };

  return verificador(9) === Number(digitos[9]) && verificador(10) === Number(digitos[10]);
}

export function formatarCPF(cpf) {
  const d = cpf.replace(/\D/g, '');

  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

// Nome, telefone e endereço (cadastro e "Editar informações").
// Retorna a mensagem de erro, ou null se os dados forem válidos.
export function validarDadosEditaveis({ nome, telefone }) {
  if (!nome.trim()) {
    return 'Digite seu nome.';
  }

  const digitosTelefone = telefone.replace(/\D/g, '');

  if (!digitosTelefone) {
    return 'Digite seu telefone.';
  }

  if (digitosTelefone.length < 10 || digitosTelefone.length > 11) {
    return 'Digite um telefone válido, com DDD.';
  }

  return null;
}

// Cadastro completo. Retorna a mensagem de erro, ou null.
export function validarCadastro({ nome, email, cpf, telefone, senha, confirmacao }) {
  if (!nome.trim()) return 'Digite seu nome completo.';
  if (!email.trim()) return 'Digite seu e-mail.';
  if (!EMAIL_VALIDO.test(email.trim())) return 'Digite um e-mail válido.';
  if (!cpf.trim()) return 'Digite seu CPF.';
  if (!cpfValido(cpf)) return 'Digite um CPF válido.';

  const erroDados = validarDadosEditaveis({ nome, telefone });

  if (erroDados) return erroDados;

  if (!senha) return 'Digite uma senha.';
  if (senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (!confirmacao) return 'Confirme sua senha.';
  if (confirmacao !== senha) return 'As senhas não conferem.';

  return null;
}

/*
 * O que "Salvar alterações" pode enviar: só nome e telefone. O
 * endereço é salvo junto com a Casa (lugares.salvarLugar); e-mail e
 * CPF nunca mudam.
 */
export function montarAlteracoes(formulario) {
  return {
    nome: formulario.nome,
    telefone: formulario.telefone,
  };
}

// Mostra só os 2 últimos caracteres: 123.456.789-10 → •••.•••.•••-10
export function mascararDocumento(documento) {
  let visiveis = 2;

  return documento
    .split('')
    .reverse()
    .map((caractere) => {
      if (!/[0-9a-z]/i.test(caractere)) {
        return caractere;
      }

      if (visiveis > 0) {
        visiveis -= 1;
        return caractere;
      }

      return '•';
    })
    .reverse()
    .join('');
}

/*
 * Foto de perfil (miniatura gerada por fotoPerfil.gerarMiniatura).
 * Fica no próprio usuarios/{uid}: o dono grava, a família lê.
 */
export async function salvarFotoPerfil(uid, foto) {
  await setDoc(
    doc(db, 'usuarios', uid),
    { foto, atualizadoEm: new Date().toISOString() },
    { merge: true }
  );

  console.log('Foto de perfil salva:', uid);
}

/*
 * Atualiza nome e telefone. O endereço não passa por aqui: muda junto
 * com a Casa (lugares.salvarLugar). E-mail e CPF não são enviados;
 * a exceção é informar o CPF pela primeira vez (conta sem CPF).
 */
export async function atualizarPerfil(uid, dados) {
  const perfil = {
    nome: dados.nome.trim(),
    telefone: formatarTelefone(dados.telefone),
  };

  const referenciaPerfil = doc(db, 'usuarios', uid);
  const atual = await getDoc(referenciaPerfil);
  const dadosAtuais = atual.exists() ? atual.data() : {};
  const grupoId = dadosAtuais.grupoId || null;

  const lote = writeBatch(db);

  lote.set(
    referenciaPerfil,
    { ...perfil, atualizadoEm: new Date().toISOString() },
    { merge: true }
  );

  /*
   * grupos/{grupoId}/membros/{uid} guarda uma cópia do nome,
   * usada na lista da família e na regra de convites
   * ("Convidado por"). As duas cópias mudam juntas.
   */
  // Nome novo → chave nova no índice de convites (a antiga sai).
  const emailSessao =
    auth.currentUser?.uid === uid && emailConfirmado() ? auth.currentUser.email : null;
  const chaveAntiga = emailSessao && dadosAtuais.nome ? chaveDiretorio(dadosAtuais.nome, emailSessao) : null;
  const chaveNova = emailSessao ? chaveDiretorio(perfil.nome, emailSessao) : null;

  if (chaveNova && chaveNova !== chaveAntiga) {
    if (chaveAntiga) {
      const antiga = await getDoc(referenciaDiretorio(chaveAntiga));

      if (antiga.exists() && antiga.data().uid === uid) {
        lote.delete(referenciaDiretorio(chaveAntiga));
      }
    }

    await incluirNoDiretorio(lote, uid, perfil.nome, emailSessao);
  }

  if (grupoId) {
    const referenciaMembro = doc(db, 'grupos', grupoId, 'membros', uid);
    const membro = await getDoc(referenciaMembro);

    if (membro.exists() && membro.data().nome !== perfil.nome) {
      lote.update(referenciaMembro, { nome: perfil.nome });
    }
  }

  await lote.commit();

  console.log('Perfil atualizado:', uid);

  return perfil;
}
