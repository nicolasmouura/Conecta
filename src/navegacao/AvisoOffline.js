/*
 * Aviso "Sem internet": flutuante no topo das telas (ao lado do
 * "‹ Menu") ou, no Menu, uma faixa no começo da tela. Tocar nele
 * explica o que continua funcionando sem conexão.
 */

import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cores, fontes, raio } from '../theme/theme';

// Mesma altura do "‹ Menu" (BotaoMenu.js).
const TOPO_MINIMO = 50;

function explicar() {
  Alert.alert(
    'Você está sem internet',
    'O Conecta continua funcionando com os últimos dados guardados no aparelho. ' +
      'SOS, "Estou bem" e o seu histórico ficam guardados e são enviados quando a ' +
      'conexão voltar. Para avisar a família agora, use o SOS por SMS.'
  );
}

function useSemInternet() {
  const rede = useNetworkState();

  // Enquanto o estado da rede não chega, considera conectado.
  return rede.isConnected === false || rede.isInternetReachable === false;
}

// faixa: versão dentro do conteúdo (Menu), em vez de flutuante.
export default function AvisoOffline({ faixa = false }) {
  const { top } = useSafeAreaInsets();
  const semInternet = useSemInternet();

  if (!semInternet) {
    return null;
  }

  const rotulo = 'Sem internet. Toque para saber o que funciona sem conexão.';

  if (faixa) {
    return (
      <TouchableOpacity
        style={styles.faixa}
        onPress={explicar}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={rotulo}
      >
        <Feather name="wifi-off" size={20} color={cores.textoSobrePrimaria} />

        <View style={styles.faixaTextos}>
          <Text style={styles.texto}>Sem internet</Text>
          <Text style={styles.detalhe}>Usando os dados guardados no aparelho.</Text>
        </View>

        <Feather name="info" size={18} color={cores.textoSobrePrimaria} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.pilula, { top: Math.max(TOPO_MINIMO, top + 8) }]}
      onPress={explicar}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
    >
      <Feather name="wifi-off" size={14} color={cores.textoSobrePrimaria} />
      <Text style={styles.texto}>Sem internet</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pilula: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: raio.pilula,
    backgroundColor: cores.pendente,
    zIndex: 20,
  },

  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderRadius: raio.card,
    backgroundColor: cores.pendente,
  },

  faixaTextos: {
    flex: 1,
  },

  texto: {
    color: cores.textoSobrePrimaria,
    fontFamily: fontes.destaque,
    fontSize: 14,
  },

  detalhe: {
    color: cores.textoSobrePrimaria,
    fontSize: 13,
  },
});
