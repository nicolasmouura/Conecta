/*
 * Convite recebido (na tela de quem ainda não tem família): mostra a
 * família e quem convidou, com Aceitar e Recusar.
 */

import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  aceitarConvite,
  mensagemDeErro,
  observarConvitesRecebidos,
  recusarConvite,
} from '../dados/convites';

import { cores, fontes, raio, sombra } from '../theme/theme';

export default function ConvitesRecebidos({ usuario, onAceito }) {
  const [convites, setConvites] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // id do convite que está sendo respondido
  const [respondendo, setRespondendo] = useState(null);

  useEffect(() => {
    const cancelar = observarConvitesRecebidos(
      (dados) => {
        setConvites(dados);
        setErro('');
        setCarregando(false);
      },
      (e) => {
        console.error('Erro ao buscar convites:', e);
        setErro('Não foi possível carregar seus convites.');
        setCarregando(false);
      }
    );

    return () => cancelar();
  }, [usuario?.uid]);

  async function aceitar(convite) {
    try {
      setRespondendo(convite.id);

      await aceitarConvite(convite, usuario);

      Alert.alert('Convite aceito.', `Você agora faz parte da ${convite.grupoNome}.`);
      onAceito(convite.grupoId);
    } catch (e) {
      console.error('Erro ao aceitar convite:', e);
      Alert.alert(
        'Erro',
        mensagemDeErro(e, 'Não foi possível aceitar o convite.')
      );
    } finally {
      setRespondendo(null);
    }
  }

  async function recusar(convite) {
    try {
      setRespondendo(convite.id);

      await recusarConvite(convite, usuario);

      Alert.alert('Convite recusado.');
    } catch (e) {
      console.error('Erro ao recusar convite:', e);
      Alert.alert(
        'Erro',
        mensagemDeErro(e, 'Não foi possível recusar o convite.')
      );
    } finally {
      setRespondendo(null);
    }
  }

  if (carregando) {
    return (
      <View style={styles.carregando}>
        <ActivityIndicator color={cores.primaria} />
        <Text style={styles.carregandoTexto}>Buscando convites...</Text>
      </View>
    );
  }

  if (erro) {
    return <Text style={styles.erro}>{erro}</Text>;
  }

  return convites.map((convite) => {
    const ocupado = respondendo === convite.id;

    return (
      <View key={convite.id} style={styles.card}>
        <Text style={styles.titulo}>Você recebeu um convite</Text>

        <Text style={styles.label}>Família</Text>
        <Text style={styles.valor}>{convite.grupoNome}</Text>

        <Text style={styles.label}>Convidado por</Text>
        <Text style={styles.valor}>{convite.deNome}</Text>

        <View style={styles.botoes}>
          <TouchableOpacity
            style={[styles.botaoAceitar, ocupado && styles.desabilitado]}
            onPress={() => aceitar(convite)}
            disabled={respondendo !== null}
          >
            {ocupado ? (
              <ActivityIndicator color={cores.textoSobrePrimaria} />
            ) : (
              <Text style={styles.botaoAceitarTexto}>Aceitar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.botaoRecusar, ocupado && styles.desabilitado]}
            onPress={() => recusar(convite)}
            disabled={respondendo !== null}
          >
            <Text style={styles.botaoRecusarTexto}>Recusar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  });
}

const styles = StyleSheet.create({
  carregando: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },

  carregandoTexto: {
    color: cores.textoSecundario,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 20,
  },

  card: {
    width: '90%',
    padding: 18,
    marginBottom: 20,
    borderRadius: raio.card,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    ...sombra,
  },

  titulo: {
    fontSize: 18,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 12,
  },

  label: {
    fontSize: 13,
    color: cores.textoSecundario,
  },

  valor: {
    fontSize: 16,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 10,
  },

  botoes: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },

  botaoAceitar: {
    flex: 1,
    padding: 13,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
    alignItems: 'center',
  },

  botaoAceitarTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 15,
    fontFamily: fontes.destaque,
  },

  botaoRecusar: {
    flex: 1,
    padding: 13,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: cores.erro,
    alignItems: 'center',
  },

  botaoRecusarTexto: {
    color: cores.erro,
    fontSize: 15,
    fontFamily: fontes.destaque,
  },

  desabilitado: {
    opacity: 0.7,
  },
});
