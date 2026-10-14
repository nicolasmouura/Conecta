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

// Zoom ao abrir e ao tocar num card: nível de rua (bairro em volta).
const ZOOM_PROXIMO = 16;
const REGIAO_PROXIMA = { latitudeDelta: 0.01, longitudeDelta: 0.01 };

// marcadores: um item por pessoa (montarMarcadores), já validados.
// pronto: dados iniciais da família carregados.
// foco: { uid, pedido } — centraliza no familiar tocado no card.
// centroInicial: minha posição atual, para o mapa já abrir perto
// (sem ela, abre na visão do mundo até os marcadores chegarem).
export default function Mapa({
  marcadores,
  pronto,
  selecionado,
  foco,
  onSelecionar,
  minhaCasa,
  centroInicial,
}) {
  const mapaRef = useRef(null);
  const mapaPronto = useRef(false);

  // Depois que o usuário mexe no mapa, não recentralizamos mais.
  const usuarioMoveu = useRef(false);
  const ultimoAlvo = useRef('');

  // Ao abrir, centraliza em mim (perto, não a família toda, que pode
  // estar longe). Sem a minha posição, no primeiro familiar do mapa.
  const alvo = marcadores.find((marcador) => marcador.voce) || marcadores[0];

  // Guardado na primeira renderização: a posição muda a cada leitura
  // do GPS e a região inicial não pode acompanhar.
  const [regiaoInicial] = useState(() =>
    centroInicial
      ? {
          latitude: centroInicial.latitude,
          longitude: centroInicial.longitude,
          ...REGIAO_PROXIMA,
        }
      : undefined
  );

  function centralizar() {
    if (
      !mapaRef.current ||
      !mapaPronto.current ||
      !pronto ||
      usuarioMoveu.current ||
      !alvo ||
      ultimoAlvo.current === alvo.uid
    ) {
      return;
    }

    ultimoAlvo.current = alvo.uid;

    const centro = { latitude: alvo.latitude, longitude: alvo.longitude };

    // Pequeno intervalo para o mapa aparecer antes da animação.
    setTimeout(() => {
      if (!mapaRef.current) return;

      mapaRef.current.animateCamera(
        { center: centro, zoom: ZOOM_PROXIMO, pitch: 0, heading: 0 },
        { duration: 1000 }
      );
    }, 300);
  }

  useEffect(() => {
    centralizar();
  }, [pronto, alvo?.uid]);

  // Card tocado: centraliza nessa pessoa (e para o enquadramento automático).
  useEffect(() => {
    if (!foco || !mapaRef.current) return;

    const alvo = marcadores.find((marcador) => marcador.uid === foco.uid);

    if (!alvo) return;

    usuarioMoveu.current = true;

    mapaRef.current.animateCamera(
      { center: { latitude: alvo.latitude, longitude: alvo.longitude }, zoom: ZOOM_PROXIMO },
      { duration: 700 }
    );
  }, [foco?.pedido]);

  return (
    <MapView
      ref={mapaRef}
      style={styles.map}
      initialRegion={regiaoInicial}
      onMapReady={() => {
        mapaPronto.current = true;
        centralizar();
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
