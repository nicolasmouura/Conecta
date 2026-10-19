/*
 * Meus lugares (a Casa): salvar e ouvir, e calcular se a pessoa está
 * em casa ou a que distância (arredondada, para proteger o endereço).
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import { observarComCopiaLocal } from './armazenamentoLocal';
import { coordenadaValida, distanciaEmMetros } from './buscarFamiliares';
import { formatarEndereco, limparEndereco, validarEndereco } from './enderecos';

/*
 * Meus lugares: usuarios/{uid}/lugares/{lugarId} — PRIVADO.
 * Só o dono lê e grava (firestore.rules). A família nunca recebe
 * endereço nem coordenadas; recebe apenas o que o aparelho do dono
 * calcula e publica em familiares/{uid} (emCasa, distanciaCasa).
 *
 * Nesta etapa só a Casa é usada; os demais tipos já têm id e regra.
 */
export const TIPOS_LUGAR = [
  { id: 'casa', nome: 'Casa', icone: 'home', obrigatorio: true },
  { id: 'trabalho', nome: 'Trabalho', icone: 'briefcase', emBreve: true },
  { id: 'escola', nome: 'Escola', icone: 'book-open', emBreve: true },
  { id: 'outro', nome: 'Outro', icone: 'map-pin', emBreve: true },
];

// "Em casa": raio base + a imprecisão do GPS (com teto) para entrar;
// só sai acima do raio de saída (histerese contra oscilação).
export const RAIO_CASA = 150;
export const MARGEM_PRECISAO_MAX = 100;
export const RAIO_SAIDA_CASA = 300;

function referenciaLugar(uid, lugarId) {
  return doc(db, 'usuarios', uid, 'lugares', lugarId);
}

// Lugares do próprio usuário: { casa: {...}, ... }.
export async function buscarLugares(uid) {
  const resultado = await getDocs(collection(db, 'usuarios', uid, 'lugares'));

  return Object.fromEntries(
    resultado.docs.map((documento) => [documento.id, { id: documento.id, ...documento.data() }])
  );
}

// Um lugar do próprio usuário em tempo real (1 documento). Sem
// internet vem a cópia do aparelho: o "em casa" continua funcionando.
export function observarLugar(uid, lugarId, callback, onErro) {
  return observarComCopiaLocal(
    `lugar:${uid}:${lugarId}`,
    (aoReceber, falhou) =>
      onSnapshot(
        referenciaLugar(uid, lugarId),
        (documento) =>
          aoReceber(
            documento.exists() ? { id: documento.id, ...documento.data() } : null,
            !documento.metadata.fromCache
          ),
        falhou
      ),
    callback,
    onErro
  );
}

/*
 * enderecoDetalhado: { pais, estado, cidade, bairro, rua, numero, cep },
 * todos obrigatórios. latitude/longitude: posição localizada a partir
 * desse endereço (EditarLugar), não a posição atual do aparelho.
 * "endereco" guarda o mesmo endereço em uma linha, para exibir.
 *
 * A Casa é também o endereço do perfil (Editar informações): os dois
 * são gravados juntos, para o marcador do mapa nunca ficar num
 * endereço e o perfil em outro.
 */
export async function salvarLugar(uid, lugarId, { enderecoDetalhado, latitude, longitude }) {
  const tipo = TIPOS_LUGAR.find((item) => item.id === lugarId);

  if (!tipo) throw new Error('LUGAR_INVALIDO');
  if (!coordenadaValida(latitude, longitude)) throw new Error('COORDENADA_INVALIDA');
  if (validarEndereco(enderecoDetalhado)) throw new Error('ENDERECO_INCOMPLETO');

  const partes = limparEndereco(enderecoDetalhado);

  const lugar = {
    tipo: tipo.id,
    nome: tipo.nome,
    endereco: formatarEndereco(partes),
    enderecoDetalhado: partes,
    latitude,
    longitude,
  };

  const lote = writeBatch(db);

  lote.set(referenciaLugar(uid, lugarId), {
    ...lugar,
    atualizadoEm: serverTimestamp(),
  });

  if (lugarId === 'casa') {
    lote.set(
      doc(db, 'usuarios', uid),
      {
        endereco: lugar.endereco,
        enderecoDetalhado: partes,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  await lote.commit();

  return { id: lugarId, ...lugar };
}

/*
 * Distância publicada para a família, arredondada para dificultar
 * estimar a posição da casa: até 1 km em múltiplos de 100 m
 * (mínimo 100 m), acima disso em múltiplos de 500 m.
 */
export function arredondarDistanciaCasa(metros) {
  if (metros < 1000) {
    return Math.max(100, Math.round(metros / 100) * 100);
  }

  return Math.round(metros / 500) * 500;
}

/*
 * Estado em relação à casa, calculado no aparelho do dono.
 * posicao: { latitude, longitude }; precisao: metros (opcional);
 * estavaEmCasa: estado anterior (histerese).
 */
export function calcularEstadoCasa({ posicao, precisao, casa, estavaEmCasa }) {
  if (!casa || !posicao || !coordenadaValida(posicao.latitude, posicao.longitude)) {
    return null;
  }

  const distancia = distanciaEmMetros(casa, posicao);
  const margem = Math.min(
    typeof precisao === 'number' && precisao > 0 ? precisao : 0,
    MARGEM_PRECISAO_MAX
  );

  const emCasa = estavaEmCasa
    ? distancia <= RAIO_SAIDA_CASA
    : distancia <= RAIO_CASA + margem;

  return {
    emCasa,
    distanciaCasa: emCasa ? 0 : arredondarDistanciaCasa(distancia),
  };
}
