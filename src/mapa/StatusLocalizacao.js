/*
 * Selo sobre o mapa com o estado do compartilhamento da localização.
 */

import { StyleSheet, Text, View } from 'react-native';
import { cores } from '../theme/theme';

// Mostra o estado do compartilhamento em um badge discreto sobre o mapa.
export default function StatusLocalizacao({ texto, ativo }) {
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.bolinha,
          { backgroundColor: ativo ? cores.online : cores.offline },
        ]}
      />

      <Text style={styles.texto} numberOfLines={5}>
        {texto}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(31, 42, 46, 0.85)',
  },

  bolinha: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  texto: {
    flex: 1,
    color: cores.superficie,
    fontSize: 12,
  },
});
