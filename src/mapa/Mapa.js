/*
 * Mapa da família: um marcador por pessoa, a sua casa e a
 * centralização no familiar escolhido.
 */

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import MapView, { Marker } from 'react-native-maps';

import MarcadorFamilia from './MarcadorFamilia';
import { cores } from '../theme/theme';

// Minha casa (só o próprio usuário recebe esses dados e vê o marcador).
function MarcadorCasa({ casa }) {
  const [acompanhar, setAcompanhar] = useState(true);

  useEffect(() => {
    const espera = setTimeout(() => setAcompanhar(false), 800);
    return () => clearTimeout(espera);
  }, []);

  return (
    <Marker
      coordinate={{ latitude: casa.latitude, longitude: casa.longitude }}
      title="Minha casa"
      description="Só você vê este marcador."
      tracksViewChanges={acompanhar}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.casa}>
        <Feather name="home" size={14} color={cores.textoSobrePrimaria} />
      </View>
    </Marker>
  );
}

const MARGEM_ENQUADRAMENTO = { top: 120, right: 60, bottom: 180, left: 60 };

// marcadores: um item por pessoa (montarMarcadores), já validados.
// pronto: dados iniciais da família carregados.
// foco: { uid, pedido } — centraliza no familiar tocado no card.
export default function Mapa({ marcadores, pronto, selecionado, foco, onSelecionar, minhaCasa }) {
  const mapaRef = useRef(null);
  const mapaPronto = useRef(false);

  // Depois que o usuário mexe no mapa, não reenquadramos mais.
  const usuarioMoveu = useRef(false);
  const ultimoEnquadramento = useRef('');

  // Muda só quando alguém aparece ou some do mapa,
  // não a cada movimento de um membro.
  const pessoasVisiveis = marcadores
    .map((marcador) => marcador.uid)
    .sort()
    .join(',');

  function enquadrar() {
    if (
      !mapaRef.current ||
      !mapaPronto.current ||
      !pronto ||
      usuarioMoveu.current ||
      !pessoasVisiveis ||
      ultimoEnquadramento.current === pessoasVisiveis
    ) {
      return;
    }

    ultimoEnquadramento.current = pessoasVisiveis;

    const coordenadas = marcadores.map(({ latitude, longitude }) => ({
      latitude,
      longitude,
    }));

    // Pequeno intervalo para o mapa aparecer antes da animação.
    setTimeout(() => {
      if (!mapaRef.current) return;

      if (coordenadas.length === 1) {
        mapaRef.current.animateCamera(
          { center: coordenadas[0], zoom: 16, pitch: 0, heading: 0 },
          { duration: 1000 }
        );
      } else {
        mapaRef.current.fitToCoordinates(coordenadas, {
          edgePadding: MARGEM_ENQUADRAMENTO,
          animated: true,
        });
      }
    }, 300);
  }

  useEffect(() => {
    enquadrar();
  }, [pronto, pessoasVisiveis]);

  // Card tocado: centraliza nessa pessoa (e para o enquadramento automático).
  useEffect(() => {
    if (!foco || !mapaRef.current) return;

    const alvo = marcadores.find((marcador) => marcador.uid === foco.uid);

    if (!alvo) return;

    usuarioMoveu.current = true;

    mapaRef.current.animateCamera(
      { center: { latitude: alvo.latitude, longitude: alvo.longitude }, zoom: 16 },
      { duration: 700 }
    );
  }, [foco?.pedido]);

  return (
    <MapView
      ref={mapaRef}
      style={styles.map}
      onMapReady={() => {
        mapaPronto.current = true;
        enquadrar();
      }}
      onPanDrag={() => {
        usuarioMoveu.current = true;
      }}
    >
      {minhaCasa && (
        <MarcadorCasa
          key={`casa-${minhaCasa.latitude}-${minhaCasa.longitude}`}
          casa={minhaCasa}
        />
      )}

      {marcadores.map((marcador) => (
        <MarcadorFamilia
          key={marcador.uid}
          membro={marcador}
          selecionado={marcador.uid === selecionado}
          onPress={() => onSelecionar?.(marcador.uid)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },

  casa: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: cores.primaria,
    borderWidth: 2,
    borderColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
