/*
 * Anúncio intersticial (tela cheia) ao voltar para o Menu, com as regras
 * de regrasAnuncios.js. Com o AdMob (build próprio) é o anúncio real; no
 * Expo Go, uma tela cheia simulada com o botão de fechar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { configPadrao, podeMostrarIntersticial } from './regrasAnuncios';
import { carregarSDK, iniciarAnuncios, OPCOES_PEDIDO } from './sdkAnuncios';
import { cores, fontes, raio } from '../theme/theme';

// Sem anúncio disponível (ex.: sem internet): tenta carregar de novo depois.
const ESPERA_NOVA_TENTATIVA = 60 * 1000;

export function IntersticialSimulado({ visivel, onFechar }) {
  return (
    <Modal visible={visivel} animationType="fade" onRequestClose={onFechar} statusBarTranslucent>
      <View style={styles.fundo}>
        <TouchableOpacity
          style={styles.fechar}
          onPress={onFechar}
          accessibilityRole="button"
          accessibilityLabel="Fechar anúncio"
        >
          <Feather name="x" size={24} color={cores.textoSobrePrimaria} />
        </TouchableOpacity>

        <Text style={styles.selo}>Anúncio</Text>
        <Text style={styles.titulo}>Anúncio de teste</Text>
        <Text style={styles.texto}>
          No app instalado, aqui aparece um anúncio em tela cheia do AdMob.
          Ele aparece no máximo a cada 2 minutos, nunca no SOS.
        </Text>
      </View>
    </Modal>
  );
}

/*
 * config: a de montarConfigAnuncios (ligado, intervalo, telas e ID).
 * ativo:  false antes do login (nada é carregado nem mostrado).
 *
 * registrarTela()            chamado ao abrir uma tela pelo Menu
 * mostrarSePuder(telaOrigem) chamado ao voltar para o Menu; true = mostrou
 * elemento                   o intersticial simulado (renderizar no App)
 */
export function useIntersticial(config = configPadrao(Platform.OS), ativo = true) {
  const AdMob = carregarSDK();
  const { idIntersticial } = config;

  // Desligado (antes do login ou pelo console): nem pede anúncio ao AdMob.
  const ligado = ativo && config.anunciosLigados && config.intersticial;

  // O simulado está sempre pronto; o real, depois de carregar.
  const [carregado, setCarregado] = useState(!AdMob);
  const [simuladoVisivel, setSimuladoVisivel] = useState(false);

  const anuncio = useRef(null);
  const ultimaExibicao = useRef(0);
  const telasAbertas = useRef(0);

  useEffect(() => {
    if (!AdMob || !ligado) return undefined;

    let montado = true;
    let novaTentativa = null;

    const intersticial = AdMob.InterstitialAd.createForAdRequest(idIntersticial, OPCOES_PEDIDO);

    anuncio.current = intersticial;

    // Anúncio novo (ex.: ID trocado no console): ainda não carregou.
    setCarregado(false);

    const carregar = () => montado && intersticial.load();

    const remover = [
      intersticial.addAdEventListener(AdMob.AdEventType.LOADED, () => {
        if (montado) setCarregado(true);
      }),
      // Fechado: já carrega o próximo.
      intersticial.addAdEventListener(AdMob.AdEventType.CLOSED, () => {
        if (!montado) return;
        setCarregado(false);
        carregar();
      }),
      intersticial.addAdEventListener(AdMob.AdEventType.ERROR, (erro) => {
        console.log('Intersticial não carregado:', erro?.code || erro?.message);
        if (!montado) return;
        setCarregado(false);
        novaTentativa = setTimeout(carregar, ESPERA_NOVA_TENTATIVA);
      }),
    ];

    iniciarAnuncios().then((iniciou) => iniciou && carregar());

    return () => {
      montado = false;
      clearTimeout(novaTentativa);
      remover.forEach((parar) => parar());
      intersticial.destroy();
      anuncio.current = null;
    };
  }, [AdMob, idIntersticial, ligado]);

  const registrarTela = useCallback(() => {
    telasAbertas.current += 1;
  }, []);

  const mostrarSePuder = useCallback(
    (telaDeOrigem) => {
      const agora = Date.now();

      const pode = podeMostrarIntersticial({
        mostrarAnuncios: ligado,
        carregado,
        agora,
        ultimaExibicao: ultimaExibicao.current,
        intervalo: config.intervalo,
        telasAbertas: telasAbertas.current,
        minimoTelas: config.telasAntesDoIntersticial,
        telaDeOrigem,
      });

      if (!pode) return false;

      const antes = { ultimaExibicao: ultimaExibicao.current, telasAbertas: telasAbertas.current };

      ultimaExibicao.current = agora;
      telasAbertas.current = 0;

      const real = anuncio.current;

      if (!real) {
        setSimuladoVisivel(true);
        return true;
      }

      // Cada anúncio só é mostrado uma vez: o próximo carrega ao fechar.
      setCarregado(false);

      real.show().catch((erro) => {
        // Não apareceu: a espera não conta e o anúncio é carregado de novo.
        console.log('Intersticial não exibido:', erro.message);
        ultimaExibicao.current = antes.ultimaExibicao;
        telasAbertas.current = antes.telasAbertas;
        if (anuncio.current === real) real.load();
      });

      return true;
    },
    [carregado, ligado, config]
  );

  const elemento = (
    <IntersticialSimulado visivel={simuladoVisivel} onFechar={() => setSimuladoVisivel(false)} />
  );

  return { registrarTela, mostrarSePuder, elemento };
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: cores.texto,
  },

  fechar: {
    position: 'absolute',
    top: 56,
    right: 20,
    padding: 8,
    borderRadius: raio.pilula,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  selo: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: raio.botaoSecundario,
    backgroundColor: cores.pendente,
    color: cores.textoSobrePrimaria,
    fontSize: 12,
    fontFamily: fontes.destaque,
    overflow: 'hidden',
  },

  titulo: {
    fontSize: 26,
    fontFamily: fontes.titulo,
    color: cores.textoSobrePrimaria,
  },

  texto: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: cores.superficieAlternativa,
  },
});
