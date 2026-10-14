/*
 * Marcador de um familiar no mapa, com a foto de perfil.
 */

import { useEffect, useState } from 'react';
import { Marker } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import FotoPerfil from '../perfil/FotoPerfil';
import { cores, fontes } from '../theme/theme';

// Tempo para o Android desenhar a foto dentro do marcador antes de
// congelar o marcador (tracksViewChanges) e poupar desempenho.
const TEMPO_DESENHO = 800;

/*
 * membro: item de montarMarcadores + foto/online/visto dos cards
 * (TelaMapa). Sem foto: círculo cinza (FotoPerfil), sem inicial.
 */
export default function MarcadorFamilia({ membro, selecionado, onPress }) {
  const [acompanhar, setAcompanhar] = useState(true);

  useEffect(() => {
    setAcompanhar(true);

    const espera = setTimeout(() => setAcompanhar(false), TEMPO_DESENHO);

    return () => clearTimeout(espera);
  }, [membro.foto, membro.online, membro.visto, membro.voce, selecionado]);

  let corBorda = cores.superficie;
  if (membro.voce) corBorda = cores.online;
  if (selecionado) corBorda = cores.primaria;

  return (
    <Marker
      coordinate={{
        latitude: membro.latitude,
        longitude: membro.longitude,
      }}
      title={membro.voce ? `${membro.nome} (você)` : membro.nome}
      description={`${membro.online ? 'Online' : 'Offline'} · ${membro.visto}`}
      tracksViewChanges={acompanhar}
      onPress={onPress}
    >
      <View style={styles.container}>
        <View style={styles.sombra}>
          <FotoPerfil
            foto={membro.foto}
            tamanho={46}
            larguraBorda={3}
            corBorda={corBorda}
          />

          <View
            style={[
              styles.status,
              { backgroundColor: membro.online ? cores.online : cores.textoSecundario },
            ]}
          />
        </View>

        <View style={styles.nomeContainer}>
          <Text style={styles.nome} numberOfLines={1}>
            {membro.voce ? 'Você' : membro.nome}
          </Text>

          <Text style={styles.detalhe} numberOfLines={1}>
            {membro.visto}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },

  sombra: {
    borderRadius: 23,
    backgroundColor: cores.superficie,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },

  status: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: cores.superficie,
  },

  nomeContainer: {
    marginTop: 4,
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: cores.superficie,
    alignItems: 'center',
  },

  nome: {
    fontSize: 12,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  detalhe: {
    fontSize: 10,
    color: cores.textoSecundario,
  },
});
