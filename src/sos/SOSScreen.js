import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Feather } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

import {
  acionarSOS,
  botoesConfirmacaoSOS,
  horarioDoAlerta,
  observarSOSAtivos,
} from '../dados/sos';
import { coordenadaValida } from '../dados/buscarFamiliares';

import { useEspacoTopo } from '../navegacao/BotaoMenu';
import { cores, fontes, raio, sombra } from '../theme/theme';

function CartaoSOS({ alerta, meu }) {
  const temLocalizacao = coordenadaValida(alerta.latitude, alerta.longitude);

  return (
    <View style={styles.cartao}>
      <View style={styles.cartaoTopo}>
        <Feather name="alert-triangle" size={20} color={cores.textoSobrePrimaria} />
        <Text style={styles.cartaoTopoTexto}>SOS ATIVO</Text>
      </View>

      <View style={styles.cartaoCorpo}>
        <Text style={styles.cartaoNome}>
          {meu ? 'Acionado por você' : `Acionado por ${alerta.nome || 'membro da família'}`}
        </Text>

        <Text style={styles.cartaoInfo}>às {horarioDoAlerta(alerta.criadoEm)}</Text>

        {temLocalizacao ? (
          <>
            <Text style={styles.cartaoInfo}>Última localização conhecida:</Text>

            <View style={styles.miniMapa}>
              <MapView
                style={styles.mapa}
                initialRegion={{
                  latitude: alerta.latitude,
                  longitude: alerta.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
              >
                <Marker
                  coordinate={{ latitude: alerta.latitude, longitude: alerta.longitude }}
                  title={alerta.nome}
                  pinColor={cores.erro}
                />
              </MapView>
            </View>
          </>
        ) : (
          <Text style={styles.cartaoInfo}>Localização indisponível.</Text>
        )}

        {meu && (
          <View style={styles.dicaEncerrar}>
            <Feather name="lock" size={15} color={cores.textoSecundario} />
            <Text style={styles.dicaEncerrarTexto}>
              Para encerrar, vá em Meu Perfil → Configurações → Segurança
              e confirme com biometria ou senha.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// Tela de emergência: acionar e acompanhar SOS. Encerrar o próprio SOS
// só em Perfil → Configurações → Segurança (sos/EncerrarSOS.js).
export default function SOSScreen({ usuario, grupoId }) {
  // Título abaixo do "‹ Menu" (que acompanha a área segura).
  const espacoTopo = useEspacoTopo(100);
  const [alertas, setAlertas] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!grupoId) return;

    return observarSOSAtivos(grupoId, setAlertas, (e) => {
      console.error('Erro ao carregar SOS:', e);
      setErro('Não foi possível carregar os alertas.');
    });
  }, [grupoId]);

  if (!grupoId) {
    return (
      <View style={[styles.container, styles.centro]}>
        <Text style={styles.mensagem}>
          Entre em uma família para usar o SOS.
        </Text>
      </View>
    );
  }

  const lista = alertas || [];
  const meuAlerta = lista.find((alerta) => alerta.uid === usuario.uid);
  const outros = lista.filter((alerta) => alerta.uid !== usuario.uid);

  async function confirmarAcionamento() {
    try {
      setEnviando(true);

      const resultado = await acionarSOS({
        uid: usuario.uid,
        grupoId,
        nome: usuario.nome,
      });

      if (!resultado.jaExistia) {
        Alert.alert(
          'SOS acionado',
          resultado.comLocalizacao
            ? 'Sua família foi avisada com sua última localização.'
            : 'Sua família foi avisada. Não havia localização disponível.'
        );
      }
    } catch (e) {
      console.error('Erro ao acionar SOS:', e);
      Alert.alert(
        'Não foi possível acionar o SOS',
        'Verifique sua conexão e tente novamente.'
      );
    } finally {
      setEnviando(false);
    }
  }

  function pedirAcionamento() {
    Alert.alert(
      'Acionar SOS?',
      'Sua família verá um alerta de emergência com seu nome, o horário e sua última localização conhecida.',
      botoesConfirmacaoSOS(confirmarAcionamento)
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.conteudo, { paddingTop: espacoTopo }]}
    >
      <Text style={styles.titulo}>SOS — Emergência</Text>
      <Text style={styles.subtitulo}>
        Use somente em caso de emergência. Sua família verá o alerta com sua
        última localização conhecida.
      </Text>

      {alertas === null && !erro && (
        <ActivityIndicator color={cores.erro} style={styles.carregando} />
      )}

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      {alertas !== null && (
        <>
          {meuAlerta ? (
            <CartaoSOS alerta={meuAlerta} meu />
          ) : (
            <TouchableOpacity
              style={[styles.botaoSOS, enviando && styles.desabilitado]}
              onPress={pedirAcionamento}
              disabled={enviando}
              activeOpacity={0.8}
            >
              <Feather name="alert-triangle" size={40} color={cores.textoSobrePrimaria} />
              <Text style={styles.botaoSOSTexto}>
                {enviando ? 'ACIONANDO...' : 'ACIONAR SOS'}
              </Text>
              <Text style={styles.botaoSOSDica}>Será pedida uma confirmação</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.secao}>SOS ativos da família</Text>

          {outros.length === 0 ? (
            <Text style={styles.mensagem}>Nenhum outro SOS ativo na família.</Text>
          ) : (
            outros.map((alerta) => (
              <CartaoSOS key={alerta.id} alerta={alerta} />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },

  conteudo: {
    paddingTop: 100,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  centro: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
  },

  titulo: {
    fontSize: 26,
    fontFamily: fontes.titulo,
    color: cores.erro,
  },

  subtitulo: {
    fontSize: 14,
    lineHeight: 20,
    color: cores.textoSecundario,
    marginTop: 4,
    marginBottom: 22,
  },

  carregando: {
    marginVertical: 30,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 16,
  },

  mensagem: {
    fontSize: 14,
    color: cores.textoSecundario,
    textAlign: 'center',
  },

  botaoSOS: {
    alignItems: 'center',
    paddingVertical: 30,
    borderRadius: raio.card + 4,
    backgroundColor: cores.erro,
    gap: 8,
    ...sombra,
  },

  botaoSOSTexto: {
    fontSize: 24,
    fontFamily: fontes.titulo,
    color: cores.textoSobrePrimaria,
    letterSpacing: 1,
  },

  botaoSOSDica: {
    fontSize: 13,
    color: cores.textoSobrePrimaria,
    opacity: 0.85,
  },

  desabilitado: {
    opacity: 0.6,
  },

  secao: {
    fontSize: 18,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginTop: 28,
    marginBottom: 12,
  },

  cartao: {
    borderRadius: raio.card,
    overflow: 'hidden',
    backgroundColor: cores.superficie,
    borderWidth: 2,
    borderColor: cores.erro,
    marginBottom: 14,
    ...sombra,
  },

  cartaoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: cores.erro,
  },

  cartaoTopoTexto: {
    fontSize: 17,
    fontFamily: fontes.titulo,
    color: cores.textoSobrePrimaria,
    letterSpacing: 1,
  },

  cartaoCorpo: {
    padding: 14,
    gap: 4,
  },

  cartaoNome: {
    fontSize: 17,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  cartaoInfo: {
    fontSize: 14,
    color: cores.textoSecundario,
  },

  miniMapa: {
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
  },

  mapa: {
    flex: 1,
  },

  dicaEncerrar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: cores.superficieAlternativa,
  },

  dicaEncerrarTexto: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: cores.textoSecundario,
  },
});
