/*
 * Firestore nos testes: um banco em memória com a mesma API usada pelo
 * app (documentos, consultas, lotes, listeners). Cada carregamento do
 * módulo (jest.resetModules) começa vazio.
 *
 * Ajudantes para os testes (prefixo __):
 *   __semear(caminho, dados)    grava um documento direto no banco
 *   __ler(caminho)              lê um documento (ou undefined)
 *   __todos()                   { caminho: dados } de todo o banco
 *   __falhar(nomeFuncao, erro)  a próxima chamada dessa função falha
 *   __semResposta(nomeFuncao)   a próxima chamada nunca termina (sem internet)
 *   __limpar()                  esvazia o banco, os listeners e as falhas
 *   __segurar(nomeFuncao)       a próxima chamada espera; devolve liberar()
 */

const banco = new Map();
const ouvintes = new Set();
const falhas = new Map();
let proximoId = 0;

class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static fromMillis(ms) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  static fromDate(data) {
    return Timestamp.fromMillis(data.getTime());
  }

  static now() {
    return Timestamp.fromMillis(Date.now());
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  toDate() {
    return new Date(this.toMillis());
  }
}

const SENTINELA = Symbol('sentinela');

function sentinela(tipo, valores) {
  return { [SENTINELA]: tipo, valores };
}

const serverTimestamp = jest.fn(() => sentinela('agora'));
const deleteField = jest.fn(() => sentinela('apagar'));
const arrayUnion = jest.fn((...valores) => sentinela('uniao', valores));
const arrayRemove = jest.fn((...valores) => sentinela('remover', valores));

function aplicarCampo(atual, valor) {
  if (!valor || !valor[SENTINELA]) return valor;

  switch (valor[SENTINELA]) {
    case 'agora':
      return Timestamp.now();
    case 'uniao': {
      const lista = Array.isArray(atual) ? [...atual] : [];
      for (const item of valor.valores) if (!lista.includes(item)) lista.push(item);
      return lista;
    }
    case 'remover':
      return (Array.isArray(atual) ? atual : []).filter((item) => !valor.valores.includes(item));
    default:
      return undefined;
  }
}

function aplicar(base, alteracoes) {
  const resultado = { ...base };

  for (const [campo, valor] of Object.entries(alteracoes)) {
    if (valor && valor[SENTINELA] === 'apagar') {
      delete resultado[campo];
    } else {
      resultado[campo] = aplicarCampo(base[campo], valor);
    }
  }

  return resultado;
}

// --- Referências -----------------------------------------------------------

function caminhoDe(partes) {
  return partes.filter(Boolean).join('/');
}

function criarDoc(caminho) {
  const partes = caminho.split('/');

  return {
    tipo: 'documento',
    id: partes[partes.length - 1],
    path: caminho,
    parent: { path: partes.slice(0, -1).join('/') },
  };
}

function criarColecao(caminho) {
  return { tipo: 'colecao', path: caminho, id: caminho.split('/').pop(), filtros: [], ordem: [], limite: null };
}

// Como o SDK real: o primeiro argumento precisa ser o Firestore ou uma referência.
function conferirPai(funcao, pai) {
  if (!pai || !['firestore', 'colecao', 'documento'].includes(pai.tipo)) {
    throw new Error(
      `Expected first argument to ${funcao}() to be a CollectionReference, a DocumentReference or FirebaseFirestore`
    );
  }
}

const collection = jest.fn((pai, ...partes) => {
  conferirPai('collection', pai);
  return criarColecao(caminhoDe([pai.path, ...partes]));
});

const doc = jest.fn((pai, ...partes) => {
  conferirPai('doc', pai);

  if (pai?.tipo === 'colecao' && partes.length === 0) {
    proximoId += 1;
    return criarDoc(`${pai.path}/auto${proximoId}`);
  }

  return criarDoc(caminhoDe([pai?.path, ...partes]));
});

const where = jest.fn((campo, operador, valor) => ({ tipo: 'filtro', campo, operador, valor }));
const orderBy = jest.fn((campo, direcao = 'asc') => ({ tipo: 'ordem', campo, direcao }));
const limit = jest.fn((n) => ({ tipo: 'limite', n }));

const query = jest.fn((colecao, ...restricoes) => {
  const consulta = { ...colecao, filtros: [...colecao.filtros], ordem: [...colecao.ordem] };

  for (const restricao of restricoes) {
    if (restricao.tipo === 'filtro') consulta.filtros.push(restricao);
    if (restricao.tipo === 'ordem') consulta.ordem.push(restricao);
    if (restricao.tipo === 'limite') consulta.limite = restricao.n;
  }

  return consulta;
});

// --- Leituras --------------------------------------------------------------

function comparavel(valor) {
  return valor instanceof Timestamp ? valor.toMillis() : valor;
}

function passa(dados, { campo, operador, valor }) {
  const atual = comparavel(dados[campo]);
  const alvo = comparavel(valor);

  switch (operador) {
    case '==':
      return atual === alvo;
    case '!=':
      return atual !== alvo;
    case '<':
      return atual < alvo;
    case '<=':
      return atual <= alvo;
    case '>':
      return atual > alvo;
    case '>=':
      return atual >= alvo;
    case 'in':
      return alvo.includes(atual);
    case 'array-contains':
      return Array.isArray(dados[campo]) && dados[campo].includes(valor);
    default:
      throw new Error(`Operador não suportado: ${operador}`);
  }
}

const METADADOS = { fromCache: false, hasPendingWrites: false };

function snapshotDoc(caminho) {
  const dados = banco.get(caminho);

  return {
    id: criarDoc(caminho).id,
    ref: criarDoc(caminho),
    metadata: METADADOS,
    exists: () => dados !== undefined,
    data: () => (dados === undefined ? undefined : { ...dados }),
  };
}

function snapshotConsulta(consulta) {
  let docs = [...banco.keys()]
    .filter((caminho) => {
      const pai = caminho.split('/').slice(0, -1).join('/');
      return pai === consulta.path;
    })
    .filter((caminho) => consulta.filtros.every((filtro) => passa(banco.get(caminho), filtro)))
    .map(snapshotDoc);

  for (const { campo, direcao } of [...consulta.ordem].reverse()) {
    docs.sort((a, b) => {
      const x = comparavel(a.data()[campo]);
      const y = comparavel(b.data()[campo]);
      const ordem = x < y ? -1 : x > y ? 1 : 0;
      return direcao === 'desc' ? -ordem : ordem;
    });
  }

  if (consulta.limite !== null) docs = docs.slice(0, consulta.limite);

  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata: METADADOS,
    forEach: (fn) => docs.forEach(fn),
  };
}

function ler(alvo) {
  return alvo.tipo === 'documento' ? snapshotDoc(alvo.path) : snapshotConsulta(alvo);
}

// Aplica __falhar / __semResposta registrados para a função.
function comFalhas(nome, executar) {
  return jest.fn((...args) => {
    const falha = falhas.get(nome)?.shift();

    if (falha === 'sem resposta') return new Promise(() => {});

    if (falha?.segurar) {
      return new Promise((resolver, rejeitar) => {
        falha.liberar = () => {
          try {
            resolver(executar(...args));
          } catch (erro) {
            rejeitar(erro);
          }
        };
      });
    }

    if (falha) return Promise.reject(falha);

    try {
      return Promise.resolve(executar(...args));
    } catch (erro) {
      return Promise.reject(erro);
    }
  });
}

const getDoc = comFalhas('getDoc', (referencia) => snapshotDoc(referencia.path));
const getDocs = comFalhas('getDocs', (consulta) => snapshotConsulta(consulta));

const onSnapshot = jest.fn((alvo, ...args) => {
  const [aoReceber, aoErrar] = typeof args[0] === 'function' ? args : args.slice(1);
  const falha = falhas.get('onSnapshot')?.shift();
  const ouvinte = { alvo, aoReceber };

  if (falha) {
    if (falha !== 'sem resposta') Promise.resolve().then(() => aoErrar?.(falha));
    return jest.fn();
  }

  ouvintes.add(ouvinte);
  aoReceber(ler(alvo));

  return jest.fn(() => ouvintes.delete(ouvinte));
});

function avisarOuvintes() {
  for (const ouvinte of [...ouvintes]) {
    if (ouvintes.has(ouvinte)) ouvinte.aoReceber(ler(ouvinte.alvo));
  }
}

// --- Gravações -------------------------------------------------------------

function erroNaoEncontrado(caminho) {
  return Object.assign(new Error(`Documento não encontrado: ${caminho}`), { code: 'not-found' });
}

function gravar(caminho, dados, opcoes) {
  const base = opcoes?.merge ? banco.get(caminho) || {} : {};
  banco.set(caminho, aplicar(base, dados));
}

function atualizar(caminho, dados) {
  if (!banco.has(caminho)) throw erroNaoEncontrado(caminho);
  banco.set(caminho, aplicar(banco.get(caminho), dados));
}

const setDoc = comFalhas('setDoc', (referencia, dados, opcoes) => {
  gravar(referencia.path, dados, opcoes);
  avisarOuvintes();
});

const updateDoc = comFalhas('updateDoc', (referencia, dados) => {
  atualizar(referencia.path, dados);
  avisarOuvintes();
});

const deleteDoc = comFalhas('deleteDoc', (referencia) => {
  banco.delete(referencia.path);
  avisarOuvintes();
});

const writeBatch = jest.fn(() => {
  const operacoes = [];

  const lote = {
    set: jest.fn((referencia, dados, opcoes) => {
      operacoes.push(() => gravar(referencia.path, dados, opcoes));
      return lote;
    }),
    update: jest.fn((referencia, dados) => {
      operacoes.push(() => atualizar(referencia.path, dados));
      return lote;
    }),
    delete: jest.fn((referencia) => {
      operacoes.push(() => banco.delete(referencia.path));
      return lote;
    }),
    commit: comFalhas('commit', () => {
      // Tudo ou nada, como no Firestore.
      const copia = new Map(banco);

      try {
        operacoes.forEach((operacao) => operacao());
      } catch (erro) {
        banco.clear();
        copia.forEach((valor, chave) => banco.set(chave, valor));
        throw erro;
      }

      avisarOuvintes();
    }),
  };

  return lote;
});

const getFirestore = jest.fn(() => ({ tipo: 'firestore' }));

module.exports = {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,

  __semear(caminho, dados) {
    banco.set(caminho, dados);
    avisarOuvintes();
  },
  __ler(caminho) {
    return banco.get(caminho);
  },
  __todos() {
    return Object.fromEntries(banco);
  },
  __limpar() {
    banco.clear();
    ouvintes.clear();
    falhas.clear();
  },
  __falhar(nome, erro) {
    if (!falhas.has(nome)) falhas.set(nome, []);
    falhas.get(nome).push(erro);
  },
  __segurar(nome) {
    const espera = { segurar: true, liberar: null };
    if (!falhas.has(nome)) falhas.set(nome, []);
    falhas.get(nome).push(espera);
    return () => espera.liberar?.();
  },
  __semResposta(nome) {
    if (!falhas.has(nome)) falhas.set(nome, []);
    falhas.get(nome).push('sem resposta');
  },
};
