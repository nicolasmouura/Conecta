/*
 * Banner de anúncio no rodapé das telas que podem ter anúncio. Com o
 * AdMob (build próprio) é o banner real; no Expo Go, um banner simulado
 * do mesmo tamanho, para ver o app como ele ficará.
 */

import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { idDoAnuncio } from './regrasAnuncios';
import { carregarSDK, OPCOES_PEDIDO } from './sdkAnuncios';
import { cores, fontes, raio } from '../theme/theme';

function BannerSimulado() {
  return (
    <View
      style={styles.simulado}
      accessibilityLabel="Anúncio de teste"
      testID="banner-simulado"
    >
      <Text style={styles.selo}>Anúncio</Text>

      <View style={styles.textos}>
        <Text style={styles.titulo}>Anúncio de teste</Text>
        <Text style={styles.detalhe} numberOfLines={1}>
          No app instalado, aqui aparece um banner do AdMob.
        </Text>
      </View>
    </View>
  );
}

// unitId: o ID do bloco (configuração remota); sem ele, o de teste.
export default function BannerAnuncio({ unitId }) {
  const AdMob = carregarSDK();
  const [falhou, setFalhou] = useState(false);

  // Acima da barra de gestos do iPhone/Android.
  const { bottom } = useSafeAreaInsets();
  const rodape = [styles.container, { paddingBottom: bottom }];

  if (!AdMob) {
    return (
      <View style={rodape}>
        <BannerSimulado />
      </View>
    );
  }

  // Sem anúncio para mostrar (ex.: sem internet): o espaço some.
  if (falhou) return null;

  return (
    <View style={rodape}>
      <AdMob.BannerAd
        unitId={unitId || idDoAnuncio('banner', Platform.OS)}
        size={AdMob.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={OPCOES_PEDIDO}
        onAdFailedToLoad={(erro) => {
          console.log('Banner não carregado:', erro?.code || erro?.message);
          setFalhou(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: cores.superficie,
  },

  // Altura de um banner adaptativo (~60) para o layout ficar igual.
  simulado: {
    width: '100%',
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: cores.superficie,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },

  selo: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: raio.botaoSecundario,
    backgroundColor: cores.pendente,
    color: cores.textoSobrePrimaria,
    fontSize: 11,
    fontFamily: fontes.destaque,
    overflow: 'hidden',
  },

  textos: {
    flex: 1,
  },

  titulo: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  detalhe: {
    fontSize: 12,
    color: cores.textoSecundario,
  },
});
