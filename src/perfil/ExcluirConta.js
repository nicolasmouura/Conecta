import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { excluirConta } from '../dados/conta';
import BotaoVoltar from '../navegacao/BotaoVoltar';
import { cores, fontes, raio } from '../theme/theme';

const APAGADOS = [
  'Seu perfil, CPF, telefone e endereço',
  'Seus lugares (casa) e sua localização no mapa',
  'Todo o seu histórico de localizações',
  'Seus alertas de SOS',
  'Convites que você enviou ou recebeu',
];

/*
 * Configurações → Excluir conta. Pede a senha (o Firebase exige um
 * login recente para apagar a conta) e uma confirmação final. A conta
 * sai da família antes (dados/conta.js). Precisa de internet.
 */
export default function ExcluirConta({ onVoltar, onExcluida }) {
  const [senha, setSenha] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');

  async function excluir() {
    try {
      setExcluindo(true);
      setErro('');

      await excluirConta(senha);

      onExcluida();
    } catch (e) {
      console.log('Conta não excluída:', e.code || e.message);
      setSenha('');
      setExcluindo(false);

      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
        setErro('Senha incorreta.');
      } else if (e.code === 'auth/network-request-failed') {
        setErro('Sem conexão. Para excluir a conta é preciso estar conectado à internet.');
      } else if (e.code === 'auth/too-many-requests') {
        setErro('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else {
        setErro('Não foi possível excluir a conta. Tente novamente.');
      }
    }
  }

  function confirmar() {
    if (!senha) {
      setErro('Digite a senha da sua conta.');
      return;
    }

    Alert.alert(
      'Excluir conta',
      'Tudo será apagado e não poderá ser recuperado. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: excluir },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <BotaoVoltar label="Configurações" onPress={onVoltar} desabilitado={excluindo} />

      <Text style={styles.titulo}>Excluir conta</Text>

      <Text style={styles.texto}>
        Você sai da sua família e estes dados são apagados para sempre:
      </Text>

      {APAGADOS.map((item) => (
        <Text key={item} style={styles.item}>
          {'•  '}
          {item}
        </Text>
      ))}

      <Text style={[styles.texto, styles.aviso]}>
        Se você for administrador, a família passa para o membro mais antigo.
        Se for o único membro, a família também é apagada.
      </Text>

      <Text style={styles.label}>Senha da conta</Text>
      <TextInput
        style={styles.input}
        value={senha}
        onChangeText={(valor) => {
          setSenha(valor);
          setErro('');
        }}
        placeholder="Digite sua senha para confirmar"
        placeholderTextColor={cores.textoSecundario}
        secureTextEntry
        autoCapitalize="none"
        editable={!excluindo}
      />

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      <TouchableOpacity
        style={[styles.botao, excluindo && styles.botaoDesabilitado]}
        onPress={confirmar}
        disabled={excluindo}
      >
        {excluindo ? (
          <ActivityIndicator color={cores.textoSobrePrimaria} />
        ) : (
          <Text style={styles.botaoTexto}>Excluir minha conta</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '90%',
    marginTop: 30,
  },

  titulo: {
    fontSize: 20,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 12,
  },

  texto: {
    fontSize: 14,
    lineHeight: 20,
    color: cores.texto,
    marginBottom: 8,
  },

  item: {
    fontSize: 14,
    lineHeight: 20,
    color: cores.textoSecundario,
    marginLeft: 4,
  },

  aviso: {
    marginTop: 12,
    marginBottom: 20,
    color: cores.textoSecundario,
  },

  label: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 6,
  },

  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.botaoSecundario + 4,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: cores.superficie,
    color: cores.texto,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 12,
  },

  botao: {
    width: '100%',
    padding: 16,
    borderRadius: raio.pilula,
    backgroundColor: cores.erro,
    alignItems: 'center',
  },

  botaoDesabilitado: {
    opacity: 0.7,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },
});
