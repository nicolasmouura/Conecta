import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// Política de envio: economiza bateria, internet e gravações.
export const INTERVALO_MINIMO_ENVIO = 15 * 1000; // nunca mais que 1 gravação a cada 15 s
export const INTERVALO_MAXIMO_ENVIO = 5 * 60 * 1000; // parado: 1 gravação a cada 5 min
export const DISTANCIA_MINIMA_ENVIO = 50; // em movimento: a cada 50 m

// Uma localização é considerada "atual" se foi gravada nos últimos
// 10 min (com o app em uso, a Etapa 3 grava pelo menos a cada 5 min).
export const LIMITE_LOCALIZACAO_ATUAL = 10 * 60 * 1000;

export function observarFamiliares(grupoId, callback, onErro) {
  // Sem grupo ainda -> lista vazia (evita mostrar dados de outros grupos)
  if (!grupoId) {
    callback([]);
    return () => {};
  }

  const referencia = query(
    collection(db, 'familiares'),
    where('grupoId', '==', grupoId)
  );

  const cancelar = onSnapshot(
    referencia,
    (consulta) => {
      const familiares = consulta.docs.map((documento) => ({
        id: documento.id,
        // Gravação local ainda sem hora do servidor: usa a estimativa.
        ...documento.data({ serverTimestamps: 'estimate' }),
      }));

      callback(familiares);
    },
    onErro
  );

  return cancelar;
}

export function coordenadaValida(latitude, longitude) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

// Timestamp do Firestore, Date ou milissegundos → milissegundos (ou null).
function paraMilissegundos(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor?.toMillis === 'function') return valor.toMillis();
  return null;
}

export function descreverAtualizacao(momento, agora) {
  if (momento === null) {
    return 'Localização disponível';
  }

  const minutos = Math.floor(Math.max(0, agora - momento) / 60000);

  if (minutos < 1) return 'Atualizado agora';
  if (minutos < 60) return `Atualizado há ${minutos} min`;

  const horas = Math.floor(minutos / 60);

  if (horas < 24) return `Atualizado há ${horas} h`;

  return `Atualizado em ${new Date(momento).toLocaleDateString('pt-BR')}`;
}

/*
 * Junta os membros ativos da família com as localizações
 * de familiares/{uid} e devolve um marcador por pessoa.
 *
 * membros       grupos/{grupoId}/membros (fonte de quem é da
 *               família e do nome, sincronizado com usuarios/{uid})
 * localizacoes  documentos de familiares/{uid} da família
 * minhaPosicao  posição do GPS deste aparelho ({ latitude, longitude,
 *               atualizadoEm }) ou null — o próprio usuário usa a
 *               posição local, mais recente que a gravada
 */
export function montarMarcadores({
  membros,
  localizacoes,
  meuUid,
  meuNome,
  minhaPosicao,
  agora,
}) {
  // Um documento por UID: o id do documento é o UID do dono.
  const localizacaoPorUid = new Map();

  for (const localizacao of localizacoes) {
    if (localizacao.uid !== undefined && localizacao.uid !== localizacao.id) {
      continue;
    }

    localizacaoPorUid.set(localizacao.id, localizacao);
  }

  const pessoas = membros
    .filter((membro) => membro.status === 'ativo')
    .map((membro) => ({ uid: membro.uid || membro.id, nome: membro.nome }));

  // Família criada antes da Etapa 1 pode não ter o registro do próprio usuário.
  if (meuUid && !pessoas.some((pessoa) => pessoa.uid === meuUid)) {
    pessoas.push({ uid: meuUid, nome: meuNome });
  }

  const marcadores = [];
  const semLocalizacao = [];
  const vistos = new Set();

  for (const pessoa of pessoas) {
    if (!pessoa.uid || vistos.has(pessoa.uid)) continue;

    vistos.add(pessoa.uid);

    const voce = pessoa.uid === meuUid;
    const localizacao = localizacaoPorUid.get(pessoa.uid);

    const nome =
      (pessoa.nome || '').trim() ||
      (localizacao?.nome || '').trim() ||
      'Membro da família';

    let origem = localizacao;

    if (voce && minhaPosicao) {
      origem = {
        latitude: minhaPosicao.latitude,
        longitude: minhaPosicao.longitude,
        atualizadoEm: minhaPosicao.atualizadoEm ?? agora,
      };
    }

    if (!origem) {
      semLocalizacao.push({ uid: pessoa.uid, nome, voce, motivo: 'indisponivel' });
      continue;
    }

    if (!coordenadaValida(origem.latitude, origem.longitude)) {
      console.warn('Localização inválida ignorada:', pessoa.uid);
      semLocalizacao.push({ uid: pessoa.uid, nome, voce, motivo: 'invalida' });
      continue;
    }

    const atualizadoEm = paraMilissegundos(origem.atualizadoEm);
    const recente =
      atualizadoEm !== null && agora - atualizadoEm <= LIMITE_LOCALIZACAO_ATUAL;

    marcadores.push({
      uid: pessoa.uid,
      nome,
      voce,
      latitude: origem.latitude,
      longitude: origem.longitude,
      atualizadoEm,
      recente,
      situacao: recente ? 'Localização atual' : 'Última localização',
      detalhe: descreverAtualizacao(atualizadoEm, agora),
      // Derivados publicados pelo próprio familiar (Etapa 11).
      rua: localizacao?.rua ?? null,
      emCasa: localizacao?.emCasa ?? null,
      distanciaCasa: localizacao?.distanciaCasa ?? null,
    });
  }

  return { marcadores, semLocalizacao };
}

// Distância aproximada em metros entre duas coordenadas.
export function distanciaEmMetros(a, b) {
  const raioTerra = 6371000;
  const paraRad = (grau) => (grau * Math.PI) / 180;

  const dLat = paraRad(b.latitude - a.latitude);
  const dLon = paraRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(paraRad(a.latitude)) *
      Math.cos(paraRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * raioTerra * Math.asin(Math.sqrt(h));
}

// ultimoEnvio: { latitude, longitude, em } da última gravação (ou null).
export function deveEnviarLocalizacao(ultimoEnvio, coordenadas, agora) {
  if (!ultimoEnvio) {
    return true;
  }

  const decorrido = agora - ultimoEnvio.em;

  if (decorrido < INTERVALO_MINIMO_ENVIO) {
    return false;
  }

  return (
    decorrido >= INTERVALO_MAXIMO_ENVIO ||
    distanciaEmMetros(ultimoEnvio, coordenadas) >= DISTANCIA_MINIMA_ENVIO
  );
}

/*
 * familiares/{uid} guarda a última localização conhecida.
 * O documento é substituído a cada envio (sem merge), então
 * "precisao" some quando o aparelho não a informa.
 * As regras conferem uid, grupoId e nome com usuarios/{uid}.
 */
/*
 * rua / estadoCasa (opcionais): derivados calculados neste aparelho
 * (enderecos.js / lugares.js). A casa em si nunca é enviada.
 */
export async function salvarLocalizacao({ uid, grupoId, nome, coordenadas, rua, estadoCasa }) {
  const localizacao = {
    uid,
    grupoId,
    nome,
    latitude: coordenadas.latitude,
    longitude: coordenadas.longitude,
    atualizadoEm: serverTimestamp(),
    online: true,
  };

  if (typeof coordenadas.accuracy === 'number' && coordenadas.accuracy >= 0) {
    localizacao.precisao = Math.round(coordenadas.accuracy);
  }

  if (typeof rua === 'string' && rua) {
    localizacao.rua = rua.slice(0, 120);
  }

  if (estadoCasa) {
    localizacao.emCasa = estadoCasa.emCasa;
    localizacao.distanciaCasa = estadoCasa.distanciaCasa;
  }

  await setDoc(doc(db, 'familiares', uid), localizacao);

  console.log(
    'Localização enviada:',
    uid,
    coordenadas.latitude,
    coordenadas.longitude
  );
}
