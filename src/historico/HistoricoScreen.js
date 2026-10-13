import { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Feather } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { observarMembros } from '../dados/grupo';
import {
  buscarHistorico,
  calcularPeriodo,
  formatarHorario,
  LIMITE_PONTOS_HISTORICO,
  PERIODOS,
} from '../dados/historico';

import { useEspacoTopo } from '../navegacao/BotaoMenu';
import { cores, fontes, raio, sombra } from '../theme/theme';

// Acima disso, só início e fim ganham marcador (a rota continua completa).
const MAXIMO_MARCADORES = 100;

const MARGEM_ENQUADRAMENTO = { top: 60, right: 50, bottom: 60, left: 50 };

// Histórico de localizações: escolher membro → período → rota no mapa.
export default function HistoricoScreen({ usuario, grupoId }) {
  // Título abaixo do "‹ Menu" (que acompanha a área segura).
  const espacoTopo = useEspacoTopo(100);
  const [membros, setMembros] = useState([]);
  const [selecionado, setSelecionado] = useState(usuario?.uid);
  const [periodo, setPeriodo] = useState('hoje');

  const [historico, setHistorico] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const mapaRef = useRef(null);

  // Membros ativos da família (nomes de grupos/{g}/membros).
  useEffect(() => {
    if (!grupoId) {
      setMembros([]);
      return;
    }

    return observarMembros(grupoId, setMembros, (e) => {
      console.error('Erro ao carregar membros:', e);
    });
  }, [grupoId]);

  // Consulta única por membro/período. Respostas atrasadas de uma
  // seleção anterior são descartadas.
  useEffect(() => {
    if (!selecionado) return;

    let ativo = true;

    setCarregando(true);
    setErro('');

    // De outro membro: só os pontos registrados nesta família.
    const familia = selecionado === usuario?.uid ? null : grupoId;

    buscarHistorico(selecionado, calcularPeriodo(periodo), familia)
      .then((resultado) => {
        if (ativo) setHistorico(resultado);
      })
      .catch((e) => {
        console.error('Erro ao carregar histórico:', e);

        if (ativo) {
          setHistorico(null);
          setErro('Não foi possível carregar o histórico.');
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [selecionado, periodo, grupoId, usuario?.uid]);

  const opcoes = [
    { uid: usuario?.uid, nome: 'Você' },
    ...membros
      .filter((membro) => membro.status === 'ativo' && membro.uid !== usuario?.uid)
      .map((membro) => ({
        uid: membro.uid,
        nome: (membro.nome || '').trim() || 'Membro da família',
      })),
  ];

  const pontos = historico?.pontos || [];
  const coordenadas = pontos.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const comData = periodo === '7dias';

  function enquadrarRota() {
    if (!mapaRef.current || coordenadas.length === 0) return;

    if (coordenadas.length === 1) {
      mapaRef.current.animateCamera({ center: coordenadas[0], zoom: 16 }, { duration: 600 });
    } else {
      mapaRef.current.fitToCoordinates(coordenadas, {
        edgePadding: MARGEM_ENQUADRAMENTO,
        animated: true,
      });
    }
  }

  function renderizarConteudo() {
    if (carregando) {
      return (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.primaria} />
          <Text style={styles.mensagem}>Carregando histórico...</Text>
        </View>
      );
    }

    if (erro) {
      return (
        <View style={styles.centro}>
          <Text style={styles.erro}>{erro}</Text>
        </View>
      );
    }

    if (pontos.length === 0) {
      return (
        <View style={styles.centro}>
          <Feather name="map" size={28} color={cores.textoSecundario} />
          <Text style={styles.mensagem}>
            Não há histórico de localização para este período.
          </Text>
        </View>
      );
    }

    const inicio = pontos[0];
    const fim = pontos[pontos.length - 1];
    const intermediarios =
      pontos.length <= MAXIMO_MARCADORES ? pontos.slice(1, -1) : [];

    return (
      <>
        <Text style={styles.resumo}>
          {pontos.length === 1 ? '1 ponto' : `${pontos.length} pontos`}
          {' · '}
          {formatarHorario(inicio.registradoEm, comData)}
          {pontos.length > 1 ? ` → ${formatarHorario(fim.registradoEm, comData)}` : ''}
        </Text>

        {historico.limitado && (
          <Text style={styles.aviso}>
            Mostrando os {LIMITE_PONTOS_HISTORICO} pontos mais recentes do período.
          </Text>
        )}

        <View style={styles.mapaCard}>
          <MapView
            key={`${selecionado}-${periodo}`}
            ref={mapaRef}
            style={styles.mapa}
            onMapReady={() => setTimeout(enquadrarRota, 300)}
          >
            {coordenadas.length > 1 && (
              <Polyline
                coordinates={coordenadas}
                strokeColor={cores.primaria}
                strokeWidth={4}
              />
            )}

            {intermediarios.map((ponto) => (
              <Marker
                key={ponto.id}
                coordinate={{ latitude: ponto.latitude, longitude: ponto.longitude }}
                title={formatarHorario(ponto.registradoEm, comData)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.ponto} />
              </Marker>
            ))}

            <Marker
              coordinate={{ latitude: inicio.latitude, longitude: inicio.longitude }}
              title={`Início · ${formatarHorario(inicio.registradoEm, comData)}`}
              pinColor={cores.online}
            />

            {pontos.length > 1 && (
              <Marker
                coordinate={{ latitude: fim.latitude, longitude: fim.longitude }}
                title={`Último registro · ${formatarHorario(fim.registradoEm, comData)}`}
                pinColor={cores.primaria}
              />
            )}
          </MapView>
        </View>
      </>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: espacoTopo }]}>
      <Text style={styles.titulo}>Histórico</Text>
      <Text style={styles.subtitulo}>Por onde sua família passou.</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.linhaChips}
        contentContainerStyle={styles.chips}
      >
        {opcoes.map((opcao) => (
          <TouchableOpacity
            key={opcao.uid}
            style={[styles.chip, selecionado === opcao.uid && styles.chipAtivo]}
            onPress={() => setSelecionado(opcao.uid)}
          >
            <Text
              style={[styles.chipTexto, selecionado === opcao.uid && styles.chipTextoAtivo]}
              numberOfLines={1}
            >
              {opcao.nome}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.chips, styles.linhaPeriodos]}>
        {PERIODOS.map((opcao) => (
          <TouchableOpacity
            key={opcao.chave}
            style={[styles.chip, periodo === opcao.chave && styles.chipAtivo]}
            onPress={() => setPeriodo(opcao.chave)}
          >
            <Text style={[styles.chipTexto, periodo === opcao.chave && styles.chipTextoAtivo]}>
              {opcao.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {renderizarConteudo()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 100,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: cores.fundo,
  },

  titulo: {
    fontSize: 26,
    fontFamily: fontes.titulo,
    color: cores.texto,
  },

  subtitulo: {
    fontSize: 14,
    color: cores.textoSecundario,
    marginBottom: 16,
  },

  linhaChips: {
    flexGrow: 0,
  },

  chips: {
    flexDirection: 'row',
    gap: 8,
  },

  linhaPeriodos: {
    marginTop: 10,
    marginBottom: 14,
  },

  chip: {
    maxWidth: 160,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },

  chipAtivo: {
    borderColor: cores.primaria,
    backgroundColor: cores.primaria,
  },

  chipTexto: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  chipTextoAtivo: {
    color: cores.textoSobrePrimaria,
  },

  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },

  mensagem: {
    fontSize: 15,
    color: cores.textoSecundario,
    textAlign: 'center',
  },

  erro: {
    fontSize: 15,
    color: cores.erro,
    textAlign: 'center',
  },

  resumo: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 6,
  },

  aviso: {
    fontSize: 12,
    color: cores.textoSecundario,
    marginBottom: 6,
  },

  mapaCard: {
    flex: 1,
    borderRadius: raio.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: cores.borda,
    ...sombra,
  },

  mapa: {
    flex: 1,
  },

  ponto: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: cores.primaria,
    borderWidth: 2,
    borderColor: cores.superficie,
  },
});
