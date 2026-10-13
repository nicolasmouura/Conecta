import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 * Simulação do Cloud Firestore para os testes (jest.setup.js troca
 * 'firebase/firestore' por este arquivo). Foi o "bancoLocal" do app
 * enquanto os dados ficavam só no aparelho.
 *
 * Imita só as funções de 'firebase/firestore' que o app usa, com os
 * mesmos nomes e o mesmo comportamento, para o src/dados/* rodar de
 * verdade nos testes, sem internet.
 *
 * Cada documento fica numa chave própria do AsyncStorage (simulado),
 * pelo caminho ("@teste:banco:usuarios/{uid}") e também em memória.
 */

const PREFIXO = '@teste:banco:';

export const db = { tipo: 'firestoreFalso' };

// caminho → dados (já com os Timestamps reconstruídos)
const documentos = new Map();

function erroBanco(codigo, mensagem) {
  const erro = new Error(mensagem);
  erro.code = codigo;
  return erro;
}

// ---------- Valores especiais (Timestamp, serverTimestamp, arrayUnion) ----------

export class Timestamp {
  constructor(milissegundos) {
    this.milissegundos = milissegundos;
  }

  static now() {
    return new Timestamp(Date.now());
  }

  static fromDate(data) {
    return new Timestamp(data.getTime());
  }

  static fromMillis(milissegundos) {
    return new Timestamp(milissegundos);
  }

  toMillis() {
    return this.milissegundos;
  }

  toDate() {
    return new Date(this.milissegundos);
  }
}

class ValorEspecial {
  constructor(tipo, valores) {
    this.tipo = tipo;
    this.valores = valores;
  }
}

// Sem servidor: a "hora do servidor" é a do aparelho no momento da gravação.
export function serverTimestamp() {
  return new ValorEspecial('horaDoServidor');
}

export function arrayUnion(...valores) {
  return new ValorEspecial('arrayUnion', valores);
}

function objetoSimples(valor) {
  return (
    valor !== null &&
    typeof valor === 'object' &&
    Object.getPrototypeOf(valor) === Object.prototype
  );
}

// Troca os valores especiais pelo valor final (como o Firestore faz ao gravar).
function resolver(valor, anterior, agora) {
  if (valor instanceof ValorEspecial) {
    if (valor.tipo === 'horaDoServidor') {
      return new Timestamp(agora);
    }

    const lista = Array.isArray(anterior) ? [...anterior] : [];

    for (const item of valor.valores) {
      if (!lista.some((existente) => iguais(existente, item))) {
        lista.push(item);
      }
    }

    return lista;
  }

  if (valor instanceof Date) {
    return Timestamp.fromDate(valor);
  }

  if (Array.isArray(valor)) {
    return valor.map((item) => resolver(item, undefined, agora));
  }

  if (objetoSimples(valor)) {
    const resultado = {};

    for (const [campo, item] of Object.entries(valor)) {
      if (item !== undefined) {
        resultado[campo] = resolver(item, anterior?.[campo], agora);
      }
    }

    return resultado;
  }

  return valor;
}

// setDoc com { merge: true }: mapas aninhados também são mesclados.
function mesclar(atual, novo) {
  const resultado = { ...atual };

  for (const [campo, valor] of Object.entries(novo)) {
    resultado[campo] =
      objetoSimples(valor) && objetoSimples(atual[campo])
        ? mesclar(atual[campo], valor)
        : valor;
  }

  return resultado;
}

// Quem lê recebe uma cópia: alterar o objeto não altera o banco.
function copiar(valor) {
  if (Array.isArray(valor)) {
    return valor.map(copiar);
  }

  if (objetoSimples(valor)) {
    return Object.fromEntries(
      Object.entries(valor).map(([campo, item]) => [campo, copiar(item)])
    );
  }

  return valor;
}

function paraTexto(dados) {
  return JSON.stringify(dados, (campo, valor) =>
    valor instanceof Timestamp ? { __timestamp: valor.toMillis() } : valor
  );
}

function deTexto(texto) {
  return JSON.parse(texto, (campo, valor) =>
    objetoSimples(valor) &&
    typeof valor.__timestamp === 'number' &&
    Object.keys(valor).length === 1
      ? new Timestamp(valor.__timestamp)
      : valor
  );
}

function iguais(a, b) {
  return a === b || paraTexto(a) === paraTexto(b);
}

// ---------- Carregamento ----------

let carregamento = null;

function carregar() {
  if (!carregamento) {
    carregamento = (async () => {
      const chaves = (await AsyncStorage.getAllKeys()).filter((chave) =>
        chave.startsWith(PREFIXO)
      );

      const pares = await AsyncStorage.multiGet(chaves);

      for (const [chave, texto] of pares) {
        if (texto === null) continue;

        try {
          documentos.set(chave.slice(PREFIXO.length), deTexto(texto));
        } catch {
          console.log('Documento simulado ilegível ignorado:', chave);
        }
      }
    })().catch((erro) => {
      // Permite tentar de novo na próxima operação.
      carregamento = null;
      throw erro;
    });
  }

  return carregamento;
}

// ---------- Referências ----------

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function gerarId(tamanho = 20) {
  let id = '';

  for (let i = 0; i < tamanho; i++) {
    id += LETRAS[Math.floor(Math.random() * LETRAS.length)];
  }

  return id;
}

function montarCaminho(base, segmentos) {
  const partes = [];

  for (const segmento of segmentos) {
    if (typeof segmento !== 'string' || !segmento) {
      throw erroBanco('invalid-argument', 'Caminho inválido: segmento vazio.');
    }

    partes.push(...segmento.split('/').filter(Boolean));
  }

  return base ? `${base}/${partes.join('/')}` : partes.join('/');
}

function contarSegmentos(caminho) {
  return caminho.split('/').length;
}

function paiDe(caminho) {
  return caminho.slice(0, caminho.lastIndexOf('/'));
}

class ReferenciaDocumento {
  constructor(caminho) {
    this.type = 'document';
    this.path = caminho;
    this.id = caminho.slice(caminho.lastIndexOf('/') + 1);
  }
}

class ReferenciaColecao {
  constructor(caminho) {
    this.type = 'collection';
    this.path = caminho;
    this.id = caminho.slice(caminho.lastIndexOf('/') + 1);
  }
}

// doc(db, 'usuarios', uid) | doc(collection(...)) (id novo) | doc(colecao, id)
export function doc(base, ...segmentos) {
  let caminho;

  if (base instanceof ReferenciaColecao) {
    caminho = montarCaminho(base.path, segmentos.length ? segmentos : [gerarId()]);
  } else {
    caminho = montarCaminho('', segmentos);
  }

  if (contarSegmentos(caminho) % 2 !== 0) {
    throw erroBanco('invalid-argument', `Não é um documento: ${caminho}`);
  }

  return new ReferenciaDocumento(caminho);
}

// collection(db, 'grupos') | collection(db, 'grupos', id, 'membros')
export function collection(base, ...segmentos) {
  const caminho = montarCaminho(
    base instanceof ReferenciaDocumento ? base.path : '',
    segmentos
  );

  if (contarSegmentos(caminho) % 2 !== 1) {
    throw erroBanco('invalid-argument', `Não é uma coleção: ${caminho}`);
  }

  return new ReferenciaColecao(caminho);
}

// ---------- Consultas ----------

class Consulta {
  constructor(colecao, restricoes) {
    this.type = 'query';
    this.colecao = colecao;
    this.restricoes = restricoes;
  }
}

export function query(base, ...restricoes) {
  if (base instanceof Consulta) {
    return new Consulta(base.colecao, [...base.restricoes, ...restricoes]);
  }

  return new Consulta(base, restricoes);
}

export function where(campo, operador, valor) {
  return { tipo: 'where', campo, operador, valor };
}

export function orderBy(campo, direcao = 'asc') {
  return { tipo: 'orderBy', campo, direcao };
}

export function limit(quantidade) {
  return { tipo: 'limit', quantidade };
}

function lerCampo(dados, campo) {
  return campo.split('.').reduce((atual, parte) => atual?.[parte], dados);
}

function comparavel(valor) {
  return valor instanceof Timestamp ? valor.toMillis() : valor;
}

// Como no Firestore, <, <=, > e >= só comparam valores do mesmo tipo.
function comparar(a, b) {
  const x = comparavel(a);
  const y = comparavel(b);

  if (typeof x !== typeof y) return null;
  if (x === y) return 0;

  return x < y ? -1 : 1;
}

function atende(dados, { campo, operador, valor }) {
  const atual = lerCampo(dados, campo);

  // Documento sem o campo nunca entra no resultado de um filtro.
  if (atual === undefined) return false;

  const ordem = comparar(atual, valor);

  switch (operador) {
    case '==':
      return iguais(atual, valor);
    case '!=':
      return !iguais(atual, valor);
    case '<':
      return ordem !== null && ordem < 0;
    case '<=':
      return ordem !== null && ordem <= 0;
    case '>':
      return ordem !== null && ordem > 0;
    case '>=':
      return ordem !== null && ordem >= 0;
    case 'array-contains':
      return Array.isArray(atual) && atual.some((item) => iguais(item, valor));
    case 'in':
      return valor.some((item) => iguais(atual, item));
    default:
      throw erroBanco('invalid-argument', `Operador não suportado: ${operador}`);
  }
}

class InstantaneoDocumento {
  constructor(caminho, dados) {
    this.ref = new ReferenciaDocumento(caminho);
    this.id = this.ref.id;
    this.dados = dados;
  }

  exists() {
    return this.dados !== undefined;
  }

  // Aceita (e ignora) { serverTimestamps: 'estimate' }: aqui a hora
  // já é gravada na hora.
  data() {
    return this.dados === undefined ? undefined : copiar(this.dados);
  }
}

class InstantaneoConsulta {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

function consultar(alvo) {
  const colecao = alvo instanceof Consulta ? alvo.colecao : alvo;
  const restricoes = alvo instanceof Consulta ? alvo.restricoes : [];

  let itens = [];

  for (const [caminho, dados] of documentos) {
    if (paiDe(caminho) === colecao.path) {
      itens.push({ caminho, id: caminho.slice(caminho.lastIndexOf('/') + 1), dados });
    }
  }

  const filtros = restricoes.filter((restricao) => restricao.tipo === 'where');
  const ordens = restricoes.filter((restricao) => restricao.tipo === 'orderBy');
  const limite = restricoes.find((restricao) => restricao.tipo === 'limit');

  itens = itens.filter((item) => filtros.every((filtro) => atende(item.dados, filtro)));

  // orderBy também tira quem não tem o campo.
  itens = itens.filter((item) =>
    ordens.every((ordem) => lerCampo(item.dados, ordem.campo) !== undefined)
  );

  // Sem orderBy, o Firestore ordena pelo id do documento.
  itens.sort((a, b) => {
    for (const ordem of ordens) {
      const resultado = comparar(lerCampo(a.dados, ordem.campo), lerCampo(b.dados, ordem.campo)) ?? 0;

      if (resultado !== 0) {
        return ordem.direcao === 'desc' ? -resultado : resultado;
      }
    }

    if (a.id === b.id) return 0;

    return a.id < b.id ? -1 : 1;
  });

  if (limite) {
    itens = itens.slice(0, limite.quantidade);
  }

  return new InstantaneoConsulta(
    itens.map((item) => new InstantaneoDocumento(item.caminho, item.dados))
  );
}

function instantaneoDe(alvo) {
  if (alvo instanceof ReferenciaDocumento) {
    return new InstantaneoDocumento(alvo.path, documentos.get(alvo.path));
  }

  return consultar(alvo);
}

// ---------- Leitura ----------

export async function getDoc(referencia) {
  await carregar();

  return new InstantaneoDocumento(referencia.path, documentos.get(referencia.path));
}

export async function getDocs(alvo) {
  await carregar();

  return consultar(alvo);
}

// ---------- Tempo real ----------

const ouvintes = new Set();

// Assinatura do resultado: evita avisar quando nada mudou para o ouvinte.
function assinaturaDe(instantaneo) {
  if (instantaneo instanceof InstantaneoDocumento) {
    return instantaneo.exists() ? paraTexto(instantaneo.dados) : '';
  }

  return paraTexto(instantaneo.docs.map((documento) => [documento.id, documento.dados]));
}

function emitir(ouvinte) {
  if (!ouvinte.ativo) return;

  const instantaneo = instantaneoDe(ouvinte.alvo);
  const assinatura = assinaturaDe(instantaneo);

  if (assinatura === ouvinte.ultimaAssinatura) return;

  ouvinte.ultimaAssinatura = assinatura;

  try {
    ouvinte.proximo(instantaneo);
  } catch (erro) {
    console.error('Erro em um ouvinte do banco simulado:', erro);
  }
}

export function onSnapshot(alvo, proximo, onErro) {
  const ouvinte = { alvo, proximo, ativo: true, ultimaAssinatura: null };

  ouvintes.add(ouvinte);

  // Como no Firestore, o primeiro resultado chega de forma assíncrona.
  carregar()
    .then(() => emitir(ouvinte))
    .catch((erro) => {
      if (ouvinte.ativo && onErro) onErro(erro);
    });

  return () => {
    ouvinte.ativo = false;
    ouvintes.delete(ouvinte);
  };
}

function avisarOuvintes(caminhosAlterados) {
  const colecoesAlteradas = new Set(caminhosAlterados.map(paiDe));

  Promise.resolve().then(() => {
    for (const ouvinte of [...ouvintes]) {
      const { alvo } = ouvinte;

      const afetado =
        alvo instanceof ReferenciaDocumento
          ? caminhosAlterados.includes(alvo.path)
          : colecoesAlteradas.has((alvo instanceof Consulta ? alvo.colecao : alvo).path);

      if (afetado) emitir(ouvinte);
    }
  });
}

// ---------- Gravação ----------

// Uma gravação por vez: cada uma parte do resultado da anterior.
let fila = Promise.resolve();

function naFila(tarefa) {
  const resultado = fila.then(tarefa);

  fila = resultado.catch(() => {});

  return resultado;
}

/*
 * Aplica as operações juntas (como um writeBatch): se uma falhar,
 * nada é gravado.
 *   { tipo: 'set' | 'update' | 'delete', referencia, dados, opcoes }
 */
function aplicar(operacoes) {
  return naFila(async () => {
    await carregar();

    const agora = Date.now();
    const novos = new Map(); // caminho → dados (undefined = apagado)

    const lerAtual = (caminho) =>
      novos.has(caminho) ? novos.get(caminho) : documentos.get(caminho);

    for (const { tipo, referencia, dados, opcoes } of operacoes) {
      const caminho = referencia.path;
      const atual = lerAtual(caminho);

      if (tipo === 'delete') {
        novos.set(caminho, undefined);
      } else if (tipo === 'update') {
        if (atual === undefined) {
          throw erroBanco('not-found', `Documento não encontrado: ${caminho}`);
        }

        novos.set(caminho, { ...atual, ...resolver(dados, atual, agora) });
      } else if (opcoes?.merge && atual !== undefined) {
        novos.set(caminho, mesclar(atual, resolver(dados, atual, agora)));
      } else {
        novos.set(caminho, resolver(dados, undefined, agora));
      }
    }

    const gravar = [];
    const remover = [];

    for (const [caminho, dados] of novos) {
      if (dados === undefined) {
        remover.push(PREFIXO + caminho);
      } else {
        gravar.push([PREFIXO + caminho, paraTexto(dados)]);
      }
    }

    if (gravar.length) await AsyncStorage.multiSet(gravar);
    if (remover.length) await AsyncStorage.multiRemove(remover);

    for (const [caminho, dados] of novos) {
      if (dados === undefined) {
        documentos.delete(caminho);
      } else {
        documentos.set(caminho, dados);
      }
    }

    avisarOuvintes([...novos.keys()]);
  });
}

export function setDoc(referencia, dados, opcoes) {
  return aplicar([{ tipo: 'set', referencia, dados, opcoes }]);
}

export function updateDoc(referencia, dados) {
  return aplicar([{ tipo: 'update', referencia, dados }]);
}

export function deleteDoc(referencia) {
  return aplicar([{ tipo: 'delete', referencia }]);
}

export async function addDoc(colecao, dados) {
  const referencia = doc(colecao);

  await setDoc(referencia, dados);

  return referencia;
}

export function writeBatch() {
  const operacoes = [];

  const lote = {
    set(referencia, dados, opcoes) {
      operacoes.push({ tipo: 'set', referencia, dados, opcoes });
      return lote;
    },

    update(referencia, dados) {
      operacoes.push({ tipo: 'update', referencia, dados });
      return lote;
    },

    delete(referencia) {
      operacoes.push({ tipo: 'delete', referencia });
      return lote;
    },

    commit() {
      return aplicar(operacoes);
    },
  };

  return lote;
}
