/*
 * Aviso no Menu enquanto houver SOS ativo na família.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { horarioDoAlerta, observarSOSAtivos } from '../dados/sos';
import { cores, fontes, raio } from '../theme/theme';

// Aviso no Menu enquanto houver SOS ativo na família.
export default function AvisoSOS({ grupoId, uidAtual, onAbrir }) {
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    return observarSOSAtivos(grupoId, setAlertas, (e) => {
      console.error('Erro ao observar SOS:', e);
    });
  }, [grupoId]);

  if (alertas.length === 0) {
    return null;
  }

  const primeiro = alertas[0];
  const quem = primeiro.uid === uidAtual ? 'Você' : primeiro.nome || 'Um membro';

  const texto =
    alertas.length === 1
      ? `${quem} acionou às ${horarioDoAlerta(primeiro.criadoEm)}`
      : `${alertas.length} alertas ativos na família`;

  return (
    <TouchableOpacity style={styles.aviso} onPress={onAbrir} activeOpacity={0.85}>
      <Feather name="alert-triangle" size={24} color={cores.textoSobrePrimaria} />

      <View style={styles.textos}>
        <Text style={styles.titulo}>SOS ATIVO</Text>
        <Text style={styles.detalhe}>{texto}</Text>
      </View>

      <Feather name="chevron-right" size={20} color={cores.textoSobrePrimaria} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 20,
    borderRadius: raio.card,
    backgroundColor: cores.erro,
  },

  textos: {
    flex: 1,
  },

  titulo: {
    fontSize: 17,
    fontFamily: fontes.titulo,
    color: cores.textoSobrePrimaria,
    letterSpacing: 1,
  },

  detalhe: {
    fontSize: 14,
    color: cores.textoSobrePrimaria,
  },
});
