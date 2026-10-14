/*
 * Botão "‹ Menu" das telas abertas pelo Menu, abaixo da área segura
 * (notch), e o espaço que essas telas deixam no topo.
 */

import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontes, raio } from '../theme/theme';

// Altura aproximada do botão (padding + uma linha de texto).
const ALTURA_BOTAO = 37;
const TOPO_MINIMO = 50;
const ESPACO_ABAIXO = 12;

// Distância do topo: abaixo da barra de status / notch / Dynamic Island.
function useTopoBotao() {
  const { top } = useSafeAreaInsets();

  return Math.max(TOPO_MINIMO, top + 8);
}

/*
 * Espaço que o conteúdo das telas abertas pelo Menu deixa no topo,
 * para o título nunca ficar embaixo do "‹ Menu". "minimo" mantém o
 * espaçamento que a tela já tinha quando ele é maior.
 */
export function useEspacoTopo(minimo = 0) {
  return Math.max(minimo, useTopoBotao() + ALTURA_BOTAO + ESPACO_ABAIXO);
}

// "‹ Menu" das telas abertas pelo Menu (App.js).
export default function BotaoMenu({ onPress }) {
  const top = useTopoBotao();

  return (
    <TouchableOpacity
      style={[styles.botao, { top }]}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel="Voltar ao menu"
    >
      <Text style={styles.texto}>‹ Menu</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  botao: {
    position: 'absolute',
    left: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: raio.pilula,
    backgroundColor: 'rgba(31, 42, 46, 0.75)',
    zIndex: 20,
  },

  texto: {
    color: '#fff',
    fontFamily: fontes.destaque,
    fontSize: 14,
  },
});
