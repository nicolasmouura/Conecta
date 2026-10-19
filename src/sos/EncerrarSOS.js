/*
 * Encerrar o próprio SOS (Configurações → Segurança), com biometria ou
 * senha; 3 senhas erradas encerram a sessão.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { auth } from '../config/firebase';
import {
  autenticarComBiometria,
  biometriaDisponivel,
  MAXIMO_FALHAS,
  registrarFalhaSenhaSOS,
  zerarFalhasSenhaSOS,
} from '../dados/biometria';
import { confirmarSenhaDaConta } from '../dados/senhaOffline';
import { encerrarSOS, horarioDoAlerta, observarMeuSOS } from '../dados/sos';
import { cores, fontes, raio } from '../theme/theme';

/*
 * Perfil → Configurações → Segurança: o ÚNICO lugar onde o próprio
 * SOS é encerrado. Pede a biometria do aparelho; se ela falhar, for
 * cancelada ou não existir, pede a senha da conta. A senha é conferida
 * no Firebase ou, sem internet, pelo hash guardado no login
 * (dados/senhaOffline.js); a senha em si nunca é guardada.
 * Depois de MAXIMO_FALHAS senhas erradas a sessão é encerrada (onSair);
 * o SOS continua ativo.
 */
export default function EncerrarSOS({ usuario, grupoId, onSair }) {
  // undefined = carregando, null = nenhum SOS ativo
  const [alerta, setAlerta] = useState(undefined);
  const [pedirSenha, setPedirSenha] = useState(false);
  const [senha, setSenha] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    return observarMeuSOS(grupoId, usuario?.uid, setAlerta, (e) => {
      console.log('SOS indisponível:', e.code || e.message);
      setAlerta(null);
    });
  }, [grupoId, usuario?.uid]);

  if (!grupoId || alerta === null) {
    return (
      <View style={styles.linha}>
        <Feather name="shield" size={18} color={cores.textoSecundario} />
        <Text style={styles.semSOS}>Você não tem nenhum SOS ativo.</Text>
      </View>
    );
  }

  if (alerta === undefined) {
    return <ActivityIndicator color={cores.erro} style={styles.carregando} />;
  }

  async function encerrar() {
    const { enviado } = await encerrarSOS(alerta.id, usuario.uid);
    await zerarFalhasSenhaSOS(usuario.uid).catch(() => {});

    // Limpa o formulário para um próximo SOS.
    setPedirSenha(false);
    setSenha('');
    setMensagem('');
    Alert.alert(
      'SOS encerrado',
      enviado
        ? 'O alerta deixou de aparecer para sua família.'
        : 'Sem internet: o alerta deixa de aparecer para sua família assim que a conexão voltar.'
    );
  }

  async function confirmarComBiometria() {
    try {
      setOcupado(true);
      setMensagem('');

      const resultado = (await biometriaDisponivel())
        ? await autenticarComBiometria('Encerrar SOS')
        : 'indisponivel';

      if (resultado === 'sucesso') {
        await encerrar();
        return;
      }

      setPedirSenha(true);
      setMensagem(
        resultado === 'indisponivel'
          ? 'Biometria indisponível neste aparelho. Digite a senha da sua conta.'
          : 'Não foi possível confirmar pela biometria. Digite a senha da sua conta.'
      );
    } catch (e) {
      console.error('Erro ao encerrar SOS:', e);
      setMensagem('Não foi possível encerrar o SOS. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarComSenha() {
    if (!senha) {
      setMensagem('Digite a senha da sua conta.');
      return;
    }

    try {
      setOcupado(true);
      setMensagem('');

      await confirmarSenhaDaConta(auth.currentUser, senha);
    } catch (e) {
      setOcupado(false);
      setSenha('');

      if (e.code === 'auth/network-request-failed') {
        setMensagem('Sem internet para conferir a senha. Use a biometria ou tente quando estiver conectado.');
        return;
      }

      if (e.code === 'auth/too-many-requests') {
        setMensagem('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
        return;
      }

      if (e.code !== 'auth/invalid-credential' && e.code !== 'auth/wrong-password') {
        setMensagem('Não foi possível confirmar a senha. Tente novamente.');
        return;
      }

      const falhas = await registrarFalhaSenhaSOS(usuario.uid).catch(() => 1);

      if (falhas >= MAXIMO_FALHAS) {
        await zerarFalhasSenhaSOS(usuario.uid).catch(() => {});
        Alert.alert(
          'Muitas tentativas',
          `A senha foi digitada errada ${MAXIMO_FALHAS} vezes. Por segurança, sua sessão foi encerrada. O SOS continua ativo.`
        );
        onSair?.();
        return;
      }

      setMensagem(`Senha incorreta (tentativa ${falhas} de ${MAXIMO_FALHAS}).`);
      return;
    }

    try {
      setSenha('');
      await encerrar();
    } catch (e) {
      console.error('Erro ao encerrar SOS:', e);
      setMensagem('Não foi possível encerrar o SOS. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <View style={styles.cartao}>
      <View style={styles.linha}>
        <Feather name="alert-triangle" size={18} color={cores.erro} />
        <Text style={styles.titulo}>Seu SOS está ativo</Text>
      </View>

      <Text style={styles.texto}>
        Acionado às {horarioDoAlerta(alerta.criadoEm)}. Para encerrar,
        confirme que é você pela biometria ou pela senha da conta.
      </Text>

      <TouchableOpacity
        style={[styles.botao, ocupado && styles.desabilitado]}
        onPress={confirmarComBiometria}
        disabled={ocupado}
      >
        <Text style={styles.botaoTexto}>
          {ocupado ? 'Confirmando...' : 'Encerrar meu SOS'}
        </Text>
      </TouchableOpacity>

      {pedirSenha && (
        <>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={(valor) => {
              setSenha(valor);
              setMensagem('');
            }}
            placeholder="Senha da conta"
            placeholderTextColor={cores.textoSecundario}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            editable={!ocupado}
            onSubmitEditing={confirmarComSenha}
          />

          <TouchableOpacity
            style={[styles.botaoSenha, ocupado && styles.desabilitado]}
            onPress={confirmarComSenha}
            disabled={ocupado}
          >
            <Text style={styles.botaoSenhaTexto}>Confirmar senha e encerrar</Text>
          </TouchableOpacity>
        </>
      )}

      {mensagem ? <Text style={styles.mensagem}>{mensagem}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  carregando: {
    marginVertical: 14,
  },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  semSOS: {
    flex: 1,
    fontSize: 14,
    color: cores.textoSecundario,
  },

  cartao: {
    padding: 14,
    borderWidth: 1.5,
    borderColor: cores.erro,
    borderRadius: 12,
    gap: 10,
  },

  titulo: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.erro,
  },

  texto: {
    fontSize: 13,
    lineHeight: 19,
    color: cores.textoSecundario,
  },

  botao: {
    paddingVertical: 13,
    borderRadius: raio.pilula,
    backgroundColor: cores.erro,
    alignItems: 'center',
  },

  botaoTexto: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.textoSobrePrimaria,
  },

  input: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.botaoSecundario + 4,
    padding: 14,
    fontSize: 16,
    backgroundColor: cores.superficie,
    color: cores.texto,
  },

  botaoSenha: {
    paddingVertical: 13,
    borderRadius: raio.pilula,
    borderWidth: 1.5,
    borderColor: cores.erro,
    alignItems: 'center',
  },

  botaoSenhaTexto: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.erro,
  },

  desabilitado: {
    opacity: 0.6,
  },

  mensagem: {
    fontSize: 13,
    color: cores.erro,
    textAlign: 'center',
  },
});
