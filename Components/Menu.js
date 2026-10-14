/*
 * Tela inicial (Menu): saudação, coração "Estou bem", mapa com a sua
 * posição e o estado do compartilhamento, atalhos para Minha Família,
 * Mapa, Histórico e Meu Perfil, botão de SOS e aviso de SOS ativo na
 * família.
 */

import { useEffect, useState } from 'react';

import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Feather } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

import { avisarQueEstouBem } from '../src/dados/estouBem';
import { formatarHorario } from '../src/dados/historico';
import { descreverLocalizacao } from '../src/mapa/compartilharLocalizacao';
import AvisoSOS from '../src/sos/AvisoSOS';

import {
  cores,
  fontes,
  raio,
  sombra,
} from '../src/theme/theme';

const OPCOES = [
  {
    chave: 'familia',
    label: 'Minha Família',
    descricao: 'Veja seus familiares',
    icone: 'users',
  },
  {
    chave: 'mapa',
    label: 'Mapa',
    descricao: 'Veja as localizações',
    icone: 'map-pin',
  },
  {
    chave: 'historico',
    label: 'Histórico',
    descricao: 'Veja por onde sua família passou',
    icone: 'clock',
  },
  {
    chave: 'perfil',
    label: 'Meu Perfil',
    descricao: 'Seus dados',
    icone: 'user',
  },
];

// Intervalo mínimo entre dois avisos de "Estou bem".
const ESPERA_ESTOU_BEM = 30 * 1000;

export default function Menu({
  onSelect,
  nome,
  localizacao: estadoLocalizacao,
  grupoId,
  uidAtual,
}) {
  // Estado vindo de useCompartilharLocalizacao (App.js)
  const localizacao = estadoLocalizacao.coordenadas;
  const descricao = descreverLocalizacao(estadoLocalizacao);

  // "Estou bem": hora do último aviso nesta sessão (para o retorno na tela).
  const [avisadoEm, setAvisadoEm] = useState(null);
  const [aguardando, setAguardando] = useState(false);

  // Um aviso a cada 30 s no máximo: evita mandar vários por engano.
  useEffect(() => {
    if (!aguardando) return undefined;

    const espera = setTimeout(() => setAguardando(false), ESPERA_ESTOU_BEM);

    return () => clearTimeout(espera);
  }, [aguardando]);

  function enviarEstouBem() {
    const momento = Date.now();

    setAvisadoEm(momento);
    setAguardando(true);

    // Sem internet, o Firebase guarda e envia quando a conexão voltar.
    avisarQueEstouBem(grupoId, uidAtual).catch((erro) => {
      console.log('"Estou bem" não enviado:', erro.code || erro.message);
      setAvisadoEm(null);
      Alert.alert('Não foi possível avisar', 'Tente novamente em instantes.');
    });
  }

  function tocarCoracao() {
    if (!grupoId) {
      Alert.alert(
        'Estou bem',
        'Entre em uma família para avisar que você está bem.'
      );
      return;
    }

    Alert.alert(
      'Avisar que você está bem?',
      'Sua família vai ver "Está bem" no seu card do mapa.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Avisar', onPress: enviarEstouBem },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cabecalho}>
          <View>
            <Text style={styles.saudar}>
              Olá, {nome || 'usuário'}! 👋
            </Text>

            <Text style={styles.titulo}>
              Bem-vindo ao Conecta
            </Text>

            <Text style={styles.subtitulo}>
              Sua família sempre mais perto.
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.coracao,
              avisadoEm && styles.coracaoAvisado,
            ]}
            onPress={tocarCoracao}
            disabled={aguardando}
            accessibilityRole="button"
            accessibilityLabel="Avisar a família que estou bem"
          >
            <Feather
              name="heart"
              size={24}
              color={
                avisadoEm
                  ? cores.textoSobrePrimaria
                  : cores.primaria
              }
            />
          </TouchableOpacity>
        </View>

        {avisadoEm && (
          <Text style={styles.avisado}>
            Família avisada que você está bem ({formatarHorario(avisadoEm, false)}).
          </Text>
        )}

        <AvisoSOS
          grupoId={grupoId}
          uidAtual={uidAtual}
          onAbrir={() => onSelect('sos')}
        />

        <TouchableOpacity
          style={styles.cardLocalizacao}
          onPress={() => onSelect('mapa')}
          activeOpacity={0.9}
        >
          <View style={styles.localizacaoTopo}>
            <View style={styles.iconeLocalizacao}>
              <Feather
                name="map-pin"
                size={24}
                color={cores.primaria}
              />
            </View>

            <View style={styles.statusAtivo}>
              <View
                style={[
                  styles.bolinhaOnline,
                  !descricao.ativo && styles.bolinhaOffline,
                ]}
              />

              <Text
                style={[
                  styles.statusTexto,
                  !descricao.ativo && styles.statusTextoOffline,
                ]}
              >
                {descricao.ativo
                  ? 'Compartilhando'
                  : 'Desativada'}
              </Text>
            </View>
          </View>

          <View style={styles.miniMapaContainer}>
            {localizacao ? (
              <MapView
                style={styles.miniMapa}
                initialRegion={{
                  latitude: localizacao.latitude,
                  longitude: localizacao.longitude,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
                showsCompass={false}
                showsScale={false}
                showsPointsOfInterest={false}
                showsBuildings={false}
                showsUserLocation={false}
              >
                <Marker
                  coordinate={{
                    latitude: localizacao.latitude,
                    longitude: localizacao.longitude,
                  }}
                  title="Você"
                />
              </MapView>
            ) : (
              <View style={styles.mapaCarregando}>
                <Feather
                  name="map-pin"
                  size={28}
                  color={cores.primaria}
                />

                <Text style={styles.mapaCarregandoTexto}>
                  {descricao.ativo
                    ? 'Localizando...'
                    : 'Sem localização'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.localizacaoTitulo}>
            {descricao.titulo}
          </Text>

          <Text style={styles.localizacaoDescricao}>
            {descricao.detalhe}
          </Text>

          {descricao.acao && (
            <TouchableOpacity
              style={styles.botaoPermitir}
              onPress={estadoLocalizacao.tentarNovamente}
            >
              <Text style={styles.botaoPermitirTexto}>
                {descricao.acao}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.verMapa}>
            <Text style={styles.verMapaTexto}>
              Ver mapa completo
            </Text>

            <Feather
              name="arrow-right"
              size={19}
              color={cores.primaria}
            />
          </View>
        </TouchableOpacity>

        <View style={styles.secaoTitulo}>
          <Text style={styles.secaoTexto}>
            Acesso rápido
          </Text>
        </View>

        <View style={styles.grid}>
          {OPCOES.map((opcao) => (
            <TouchableOpacity
              key={opcao.chave}
              style={styles.card}
              onPress={() => onSelect(opcao.chave)}
              activeOpacity={0.8}
            >
              <View style={styles.iconeContainer}>
                <Feather
                  name={opcao.icone}
                  size={23}
                  color={cores.primaria}
                />
              </View>

              <View style={styles.cardInfo}>
                <Text style={styles.cardLabel}>
                  {opcao.label}
                </Text>

                <Text style={styles.cardDescricao}>
                  {opcao.descricao}
                </Text>
              </View>

              <Feather
                name="chevron-right"
                size={18}
                color={cores.textoSecundario}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* No fim da lista, separado dos atalhos do dia a dia. */}
        <TouchableOpacity
          style={styles.cardSOS}
          onPress={() => onSelect('sos')}
          activeOpacity={0.8}
        >
          <View style={styles.iconeSOS}>
            <Feather
              name="alert-triangle"
              size={23}
              color={cores.erro}
            />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardLabelSOS}>
              SOS — Emergência
            </Text>

            <Text style={styles.cardDescricao}>
              Avise sua família em caso de emergência
            </Text>
          </View>

          <Feather
            name="chevron-right"
            size={18}
            color={cores.erro}
          />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },

  scroll: {
    flex: 1,
  },

  conteudo: {
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 35,
  },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  saudar: {
    fontSize: 16,
    color: cores.textoSecundario,
    marginBottom: 3,
  },

  titulo: {
    fontSize: 25,
    fontFamily: fontes.titulo,
    color: cores.texto,
  },

  subtitulo: {
    fontSize: 14,
    color: cores.textoSecundario,
    marginTop: 4,
  },

  coracao: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra,
  },

  coracaoAvisado: {
    backgroundColor: cores.primaria,
  },

  avisado: {
    fontSize: 13,
    color: cores.primaria,
    marginTop: -14,
    marginBottom: 18,
  },

  cardLocalizacao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.card + 2,
    padding: 20,
    marginBottom: 26,
    borderWidth: 1,
    borderColor: cores.borda,
    ...sombra,
  },

  localizacaoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  iconeLocalizacao: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: cores.superficieAlternativa,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusAtivo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: raio.pilula,
  },

  bolinhaOnline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: cores.online,
    marginRight: 6,
  },

  bolinhaOffline: {
    backgroundColor: cores.offline,
  },

  statusTexto: {
    fontSize: 12,
    fontFamily: fontes.destaque,
    color: cores.online,
  },

  statusTextoOffline: {
    color: cores.offline,
  },

  botaoPermitir: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
  },

  botaoPermitirTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 14,
    fontFamily: fontes.destaque,
  },

  miniMapaContainer: {
    width: '100%',
    height: 145,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: cores.superficieAlternativa,
  },

  miniMapa: {
    width: '100%',
    height: '100%',
  },

  mapaCarregando: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapaCarregandoTexto: {
    marginTop: 6,
    fontSize: 13,
    color: cores.textoSecundario,
  },

  localizacaoTitulo: {
    fontSize: 20,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 5,
  },

  localizacaoDescricao: {
    fontSize: 14,
    lineHeight: 20,
    color: cores.textoSecundario,
    maxWidth: '90%',
  },

  verMapa: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },

  verMapaTexto: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.primaria,
    marginRight: 6,
  },

  secaoTitulo: {
    marginBottom: 12,
  },

  secaoTexto: {
    fontSize: 18,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  grid: {
    gap: 10,
  },

  card: {
    minHeight: 76,
    width: '100%',
    borderRadius: raio.card,
    backgroundColor: cores.superficie,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: cores.borda,
  },

  iconeContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: cores.superficieAlternativa,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  cardInfo: {
    flex: 1,
  },

  cardLabel: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 3,
  },

  cardSOS: {
    minHeight: 76,
    width: '100%',
    borderRadius: raio.card,
    backgroundColor: cores.superficie,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 24,
    borderWidth: 1.5,
    borderColor: cores.erro,
  },

  iconeSOS: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  cardLabelSOS: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.erro,
    marginBottom: 3,
  },

  cardDescricao: {
    fontSize: 12,
    color: cores.textoSecundario,
  },
});