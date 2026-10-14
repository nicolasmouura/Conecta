/*
 * Hook que compartilha a localização enquanto o app está aberto:
 * permissão, GPS, envio para a família (com rua e situação da casa) e
 * pontos do histórico.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';

import {
  deveEnviarLocalizacao,
  distanciaEmMetros,
  salvarLocalizacao,
} from '../dados/buscarFamiliares';
import {
  deveRegistrarHistorico,
  registrarPontoHistorico,
} from '../dados/historico';
import { calcularEstadoCasa, observarLugar } from '../dados/lugares';
import { criarCacheRua } from '../dados/enderecos';

// Precisão "Balanced" (Wi-Fi/rede, ~100 m) gasta bem menos bateria que o GPS puro.
// timeInterval vale no Android; o envio ao Firebase é filtrado em deveEnviarLocalizacao.
const OPCOES_GPS = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 30 * 1000,
  distanceInterval: 0,
};

// Evita redesenhar a tela a cada leitura do GPS.
const INTERVALO_MINIMO_TELA = 10 * 1000;
const DISTANCIA_MINIMA_TELA = 10;

const ESTADOS_PARADOS = ['negado', 'bloqueado', 'gps_desligado', 'erro'];

/*
 * status:
 *   sem_familia   usuário sem família (nada é pedido)
 *   verificando   checando permissão / GPS
 *   compartilhando permissão ok, GPS ativo
 *   negado        permissão negada (ainda pode pedir de novo)
 *   bloqueado     permissão negada em definitivo (só nas configurações)
 *   gps_desligado serviço de localização do aparelho desligado
 *   erro          não foi possível obter a localização
 */
const ESTADO_INICIAL = {
  status: 'sem_familia',
  coordenadas: null,
  atualizadoEm: null,
  erroEnvio: false,
};

/*
 * Compartilha a localização atual com a família enquanto o
 * app estiver em uso. Existe um único watcher por vez: ele é
 * encerrado ao sair da conta, ao trocar de família ou ao
 * reiniciar o ciclo (tentarNovamente).
 */
export function useCompartilharLocalizacao(usuario, grupoId) {
  const uid = usuario?.uid;

  // O nome pode mudar em "Meu Perfil" sem reiniciar o watcher.
  const nomeRef = useRef(usuario?.nome);
  nomeRef.current = usuario?.nome;

  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const [ciclo, setCiclo] = useState(0);

  // A permissão é pedida no máximo uma vez por ciclo iniciado
  // pelo app/usuário, nunca em resposta ao AppState (sem loop).
  const podePedirPermissao = useRef(true);

  const statusRef = useRef(estado.status);
  statusRef.current = estado.status;

  useEffect(() => {
    if (!uid || !grupoId) {
      setEstado(ESTADO_INICIAL);
      return;
    }

    let ativo = true;
    let assinatura = null;
    let ultimoEnvio = null;
    let ultimoPontoHistorico = null;
    let ultimaTela = null;
    let enviando = false;

    // Etapa 11: casa (privada, só deste usuário) e rua atual, usadas
    // para publicar apenas derivados: emCasa, distanciaCasa e rua.
    let casa = null;
    let estavaEmCasa = false;
    const ruaAtual = criarCacheRua();

    const cancelarCasa = observarLugar(
      uid,
      'casa',
      (lugar) => {
        casa = lugar;
        // Casa alterada: o próximo sinal do GPS já publica o novo estado.
        ultimoEnvio = null;
      },
      (erro) => console.log('Casa indisponível:', erro.code || erro.message)
    );

    async function registrarPosicao({ coords }) {
      if (!ativo) return;

      const agora = Date.now();

      if (
        !ultimaTela ||
        agora - ultimaTela.em >= INTERVALO_MINIMO_TELA ||
        distanciaEmMetros(ultimaTela, coords) >= DISTANCIA_MINIMA_TELA
      ) {
        ultimaTela = { latitude: coords.latitude, longitude: coords.longitude, em: agora };

        setEstado((atual) => ({
          ...atual,
          status: 'compartilhando',
          coordenadas: coords,
        }));
      }

      if (enviando || !deveEnviarLocalizacao(ultimoEnvio, coords, agora)) {
        return;
      }

      enviando = true;

      try {
        const estadoCasa = calcularEstadoCasa({
          posicao: coords,
          precisao: coords.accuracy,
          casa,
          estavaEmCasa,
        });

        const rua = await ruaAtual(coords, agora);

        await salvarLocalizacao({
          uid,
          grupoId,
          nome: nomeRef.current,
          coordenadas: coords,
          rua,
          estadoCasa,
        });

        estavaEmCasa = estadoCasa?.emCasa ?? false;

        ultimoEnvio = { latitude: coords.latitude, longitude: coords.longitude, em: agora };

        if (ativo) {
          setEstado((atual) => ({
            ...atual,
            status: 'compartilhando',
            coordenadas: coords,
            atualizadoEm: agora,
            erroEnvio: false,
          }));
        }

        // Histórico: aproveita o mesmo envio (sem outro watcher/GPS).
        // Uma falha aqui nunca afeta a localização atual.
        if (deveRegistrarHistorico(ultimoPontoHistorico, coords, agora)) {
          try {
            await registrarPontoHistorico({ uid, grupoId, coordenadas: coords });

            ultimoPontoHistorico = { latitude: coords.latitude, longitude: coords.longitude, em: agora };
          } catch (erroHistorico) {
            console.error('Erro ao registrar histórico:', erroHistorico);
          }
        }
      } catch (erro) {
        console.error('Erro ao enviar localização:', erro);

        if (ativo) {
          setEstado((atual) => ({ ...atual, erroEnvio: true }));
        }
      } finally {
        enviando = false;
      }
    }

    async function iniciar() {
      try {
        setEstado((atual) => ({ ...atual, status: 'verificando' }));

        let permissao = await Location.getForegroundPermissionsAsync();

        if (
          permissao.status !== 'granted' &&
          permissao.canAskAgain &&
          podePedirPermissao.current
        ) {
          podePedirPermissao.current = false;
          permissao = await Location.requestForegroundPermissionsAsync();
        }

        if (!ativo) return;

        if (permissao.status !== 'granted') {
          setEstado((atual) => ({
            ...atual,
            status: permissao.canAskAgain ? 'negado' : 'bloqueado',
          }));
          return;
        }

        const gpsLigado = await Location.hasServicesEnabledAsync();

        if (!ativo) return;

        if (!gpsLigado) {
          setEstado((atual) => ({ ...atual, status: 'gps_desligado' }));
          return;
        }

        const novaAssinatura = await Location.watchPositionAsync(
          OPCOES_GPS,
          registrarPosicao,
          (erro) => {
            console.error('Erro no GPS:', erro);

            if (ativo) {
              setEstado((atual) => ({ ...atual, status: 'erro' }));
            }
          }
        );

        if (!ativo) {
          novaAssinatura.remove();
          return;
        }

        assinatura = novaAssinatura;

        setEstado((atual) => ({ ...atual, status: 'compartilhando' }));
      } catch (erro) {
        console.error('Erro ao iniciar localização:', erro);

        if (ativo) {
          setEstado((atual) => ({ ...atual, status: 'erro' }));
        }
      }
    }

    iniciar();

    return () => {
      ativo = false;
      cancelarCasa();

      if (assinatura) {
        assinatura.remove();
      }
    };
  }, [uid, grupoId, ciclo]);

  // Ao voltar para o app (ex.: depois de liberar a permissão ou
  // ligar o GPS nas configurações), confere de novo, sem pedir.
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (novoEstado) => {
      if (
        novoEstado === 'active' &&
        ESTADOS_PARADOS.includes(statusRef.current)
      ) {
        setCiclo((atual) => atual + 1);
      }
    });

    return () => assinatura.remove();
  }, []);

  const tentarNovamente = useCallback(() => {
    if (statusRef.current === 'bloqueado') {
      Linking.openSettings();
      return;
    }

    podePedirPermissao.current = true;
    setCiclo((atual) => atual + 1);
  }, []);

  return { ...estado, tentarNovamente };
}

function tempoDesde(momento) {
  const segundos = Math.round((Date.now() - momento) / 1000);

  if (segundos < 60) return 'há poucos segundos';

  const minutos = Math.round(segundos / 60);

  if (minutos < 60) return `há ${minutos} min`;

  const data = new Date(momento);

  return `às ${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

// Textos exibidos no Menu e no Mapa para cada estado.
export function descreverLocalizacao(localizacao) {
  const { status, atualizadoEm, erroEnvio } = localizacao;

  if (status === 'compartilhando') {
    let detalhe = 'Obtendo sua localização...';

    if (erroEnvio) {
      detalhe = 'Não foi possível enviar sua localização. Tentaremos novamente.';
    } else if (atualizadoEm) {
      detalhe = `Última atualização: ${tempoDesde(atualizadoEm)}`;
    }

    return { ativo: true, titulo: 'Compartilhando localização', detalhe };
  }

  const TEXTOS = {
    sem_familia: {
      titulo: 'Localização não compartilhada',
      detalhe: 'Entre em uma família para compartilhar sua localização.',
    },
    verificando: {
      titulo: 'Verificando localização...',
      detalhe: 'Aguarde um instante.',
    },
    negado: {
      titulo: 'Localização desativada',
      detalhe: 'Permita o acesso à localização para compartilhar sua posição com sua família.',
      acao: 'Permitir localização',
    },
    bloqueado: {
      titulo: 'Localização bloqueada',
      detalhe: 'O acesso foi negado. Para compartilhar, ative a localização do Conecta nas configurações do aparelho.',
      acao: 'Abrir configurações',
    },
    gps_desligado: {
      titulo: 'GPS desativado',
      detalhe: 'Ative a localização do aparelho para compartilhar sua posição.',
      acao: 'Tentar novamente',
    },
    erro: {
      titulo: 'Localização indisponível',
      detalhe: 'Não foi possível obter sua localização. Verifique o GPS e tente novamente.',
      acao: 'Tentar novamente',
    },
  };

  return { ativo: false, ...(TEXTOS[status] || TEXTOS.erro) };
}
