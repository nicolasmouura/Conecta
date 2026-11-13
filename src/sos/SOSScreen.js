/*
 * Tela de SOS: acionar o alerta para a família, ver os SOS ativos e
 * avisar por SMS (funciona sem internet).
 */

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
  botoesConfirmacaoSOS,
  horarioDoAlerta,
  observarSOSAtivos,
} from '../dados/sos';
import { acionarEmergencia } from '../dados/emergencia';
import { coordenadaValida } from '../dados/buscarFamiliares';
import { enviarSOSPorSMS } from '../dados/smsSOS';
import { pedirPermissaoSMS } from '../dados/smsAutomatico';
import { NUMEROS_EMERGENCIA, ligarParaEmergencia } from '../dados/ligacao';

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

// "Avisar por SMS": funciona sem internet (abre o app de mensagens).
function BotaoSMS({ onPress, abrindo }) {
  return (
    <View style={styles.sms}>
      <TouchableOpacity
        style={[styles.botaoSMS, abrindo && styles.desabilitado]}
        onPress={onPress}
        disabled={abrindo}
        accessibilityRole="button"
      >
        <Feather name="message-square" size={18} color={cores.erro} />
        <Text style={styles.botaoSMSTexto}>
          {abrindo ? 'Abrindo mensagens...' : 'Avisar por SMS'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.dicaSMS}>
        Funciona sem internet: abre o app de mensagens com sua localização e os
        telefones da família. Se faltar algum contato, escolha no próprio app.
      </Text>
    </View>
  );
}

// Abre o discador com o número de emergência (funciona em qualquer rede).
function BotoesLigar() {
  async function ligar(numero) {
    if (!(await ligarParaEmergencia(numero))) {
      Alert.alert('Não foi possível ligar', `Disque ${numero} no seu telefone.`);
    }
  }

  const [principal, ...outros] = NUMEROS_EMERGENCIA;

  return (
    <View style={styles.ligar}>
      <Text style={styles.ligarTitulo}>Ligar para a emergência</Text>

      <TouchableOpacity
        style={styles.botaoDestaque}
        onPress={() => ligar(principal.numero)}
        accessibilityRole="button"
        accessibilityLabel={`Ligar ${principal.numero} ${principal.nome}`}
      >
        <View style={styles.botaoDestaqueTopo}>
          <Feather name="phone-call" size={22} color={cores.textoSobrePrimaria} />
          <Text style={styles.botaoDestaqueNumero}>{principal.numero}</Text>
        </View>

        <Text style={styles.botaoDestaqueAviso}>
          Funciona sem internet e sem sinal da sua operadora, até sem chip
        </Text>
      </TouchableOpacity>

      <Text style={styles.dicaSMS}>
        O 112 usa qualquer rede de celular disponível. SMS e internet precisam
        do sinal da sua operadora.
      </Text>

      <View style={styles.ligarLinha}>
        {outros.map(({ numero, nome }) => (
          <TouchableOpacity
            key={numero}
            style={styles.botaoLigar}
            onPress={() => ligar(numero)}
            accessibilityRole="button"
            accessibilityLabel={`Ligar ${numero} ${nome}`}
          >
            <Feather name="phone" size={16} color={cores.textoSobrePrimaria} />
            <Text style={styles.botaoLigarNumero}>{numero}</Text>
            <Text style={styles.botaoLigarNome}>{nome}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/*
 * O que contar à pessoa depois de acionar. null = nada a dizer (o app
 * de mensagens já está aberto e o alerta do app foi registrado).
 */
export function resumoDaEmergencia({ sms, sos }) {
  const linhas = [];
  let atencao = false;

  if (sms.resultado === 'automatico') {
    linhas.push(
      `SMS enviado para ${sms.enviados} ${sms.enviados === 1 ? 'familiar' : 'familiares'}.`
    );

    if (sms.falhas > 0) {
      atencao = true;
      linhas.push(`Não saiu para ${sms.falhas}.`);
    }
  } else if (sms.resultado !== 'aberto') {
    atencao = true;
    linhas.push('Não foi possível avisar por SMS. Ligue para o 112: ele funciona em qualquer rede disponível.');
  }

  if (sos?.erro) {
    atencao = true;
    linhas.push('O alerta no app não foi registrado.');
  } else if (sos && !sos.jaExistia) {
    linhas.push(
      sos.enviado
        ? 'Alerta enviado no app.'
        : 'Sem internet: o alerta no app sai quando a conexão voltar.'
    );
  }

  if (sms.resultado === 'aberto' && !atencao) return null;

  return { titulo: atencao ? 'Atenção' : 'SOS acionado', mensagem: linhas.join('\n') };
}

// Tela de emergência: acionar e acompanhar SOS. Encerrar o próprio SOS
// só em Perfil → Configurações → Segurança (sos/EncerrarSOS.js).
export default function SOSScreen({ usuario, grupoId, posicaoAtual, posicaoEm }) {
  // Título abaixo do "‹ Menu" (que acompanha a área segura).
  const espacoTopo = useEspacoTopo(100);
  const [alertas, setAlertas] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [abrindoSMS, setAbrindoSMS] = useState(false);

  // Android: a permissão do SMS automático é pedida agora, com calma,
  // e não no meio da emergência.
  useEffect(() => {
    pedirPermissaoSMS();
  }, []);

  useEffect(() => {
    if (!grupoId) return;

    return observarSOSAtivos(grupoId, setAlertas, (e) => {
      console.error('Erro ao carregar SOS:', e);
      setErro('Não foi possível carregar os alertas.');
    });
  }, [grupoId]);

  async function avisarPorSMS() {
    try {
      setAbrindoSMS(true);

      const { resultado } = await enviarSOSPorSMS({
        uid: usuario.uid,
        grupoId,
        nome: usuario.nome,
        posicao: posicaoAtual,
        posicaoEm,
      });

      if (resultado === 'indisponivel') {
        Alert.alert('SMS indisponível', 'Este aparelho não consegue enviar SMS.');
      }
    } catch (e) {
      console.error('Erro ao abrir o SMS:', e);
      Alert.alert('Não foi possível abrir as mensagens', 'Tente novamente.');
    } finally {
      setAbrindoSMS(false);
    }
  }

  if (!grupoId) {
    return (
      <View style={[styles.container, styles.centro]}>
        <Text style={styles.mensagem}>
          Entre em uma família para usar o SOS.
        </Text>

        <BotaoSMS onPress={avisarPorSMS} abrindo={abrindoSMS} />
        <BotoesLigar />
      </View>
    );
  }

  const lista = alertas || [];
  const meuAlerta = lista.find((alerta) => alerta.uid === usuario.uid);
  const outros = lista.filter((alerta) => alerta.uid !== usuario.uid);

  async function confirmarAcionamento() {
    try {
      setEnviando(true);

      // SMS e alerta do app saem juntos: sem internet, o SMS não espera.
      const resultado = await acionarEmergencia({
        uid: usuario.uid,
        grupoId,
        nome: usuario.nome,
        posicao: posicaoAtual,
        posicaoEm,
      });

      const resumo = resumoDaEmergencia(resultado);

      if (resumo) {
        Alert.alert(resumo.titulo, resumo.mensagem, [{ text: 'OK' }]);
      }
    } catch (e) {
      console.error('Erro ao acionar SOS:', e);
      Alert.alert(
        'Não foi possível acionar o SOS',
        'Avise sua família por SMS ou ligue para a emergência.',
        [{ text: 'OK' }]
      );
    } finally {
      setEnviando(false);
    }
  }

  function pedirAcionamento() {
    Alert.alert(
      'Acionar SOS?',
      'Sua família receberá um SMS e um alerta de emergência com seu nome, o horário e sua última localização conhecida.',
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

          <BotaoSMS onPress={avisarPorSMS} abrindo={abrindoSMS} />

          <BotoesLigar />

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

  sms: {
    alignSelf: 'stretch',
    marginTop: 16,
    gap: 8,
  },

  botaoSMS: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: raio.pilula,
    borderWidth: 1.5,
    borderColor: cores.erro,
    backgroundColor: cores.superficie,
  },

  botaoSMSTexto: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.erro,
  },

  dicaSMS: {
    fontSize: 12,
    lineHeight: 17,
    color: cores.textoSecundario,
    textAlign: 'center',
  },

  ligar: {
    alignSelf: 'stretch',
    marginTop: 22,
    gap: 10,
  },

  ligarTitulo: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  botaoDestaque: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: raio.card,
    backgroundColor: cores.erro,
    ...sombra,
  },

  botaoDestaqueTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  botaoDestaqueNumero: {
    fontSize: 28,
    fontFamily: fontes.titulo,
    color: cores.textoSobrePrimaria,
    letterSpacing: 1,
  },

  botaoDestaqueAviso: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: cores.textoSobrePrimaria,
  },

  ligarLinha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  botaoLigar: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: raio.pilula,
    backgroundColor: cores.erro,
  },

  botaoLigarNumero: {
    fontSize: 16,
    fontFamily: fontes.titulo,
    color: cores.textoSobrePrimaria,
  },

  botaoLigarNome: {
    fontSize: 13,
    color: cores.textoSobrePrimaria,
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
