/*
 * Botão "← Voltar" das subtelas de Configurações; o voltar do Android
 * faz o mesmo.
 */

import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useVoltarAndroid } from './voltar';
import { cores, fontes } from '../theme/theme';

/*
 * "← Configurações" das subtelas. O voltar do Android faz o mesmo que
 * tocar no botão, e também fica bloqueado enquanto "desabilitado"
 * (ex.: salvando), para não interromper a operação.
 */
export default function BotaoVoltar({ label, onPress, desabilitado = false }) {
  useVoltarAndroid(true, () => {
    if (!desabilitado) onPress();
  });

  return (
    <TouchableOpacity
      style={styles.voltar}
      onPress={onPress}
      disabled={desabilitado}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={`Voltar para ${label}`}
      accessibilityState={{ disabled: desabilitado }}
    >
      <Feather name="arrow-left" size={20} color={cores.texto} />
      <Text style={styles.voltarTexto}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  voltar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },

  voltarTexto: {
    fontSize: 15,
    color: cores.textoSecundario,
    fontFamily: fontes.destaque,
  },
});
