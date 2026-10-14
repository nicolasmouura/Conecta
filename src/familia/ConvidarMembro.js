/*
 * Janela "Convidar familiar": nome completo e e-mail cadastrados da
 * pessoa e envio do convite.
 */

import { useState } from 'react';

import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { enviarConvite, mensagemDeErro } from '../dados/convites';
import { cores, fontes, raio } from '../theme/theme';

export default function ConvidarMembro({
  visivel,
  grupo,
  remetente,
  onFechar,
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [enviando, setEnviando] = useState(false);

  function fechar() {
    setNome('');
    setEmail('');
    setErro('');
    setSucesso('');
    onFechar();
  }

  async function enviar() {
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha o nome completo e o e-mail cadastrado.');
      return;
    }

    try {
      setErro('');
      setSucesso('');
      setEnviando(true);

      await enviarConvite({ grupo, remetente, nome, email });

      setNome('');
      setEmail('');
      setSucesso('Convite enviado com sucesso.');
    } catch (e) {
      console.log('Convite não enviado:', e.code || e.message);
      setErro(mensagemDeErro(e, 'Não foi possível enviar o convite.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      visible={visivel}
      transparent
      animationType="fade"
      onRequestClose={fechar}
    >
      <View style={styles.fundo}>
        <View style={styles.container}>
          <Text style={styles.titulo}>Convidar familiar</Text>

          <Text style={styles.texto}>
            Informe o nome completo e o e-mail exatamente como a pessoa
            cadastrou no Conecta. Ela verá o convite ao abrir o aplicativo.
          </Text>

          <Text style={styles.label}>Nome completo</Text>

          <TextInput
            style={styles.input}
            placeholder="Nome completo cadastrado"
            placeholderTextColor={cores.textoSecundario}
            value={nome}
            onChangeText={(texto) => {
              setNome(texto);
              setErro('');
              setSucesso('');
            }}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={60}
            editable={!enviando}
          />

          <Text style={styles.label}>E-mail cadastrado</Text>

          <TextInput
            style={styles.input}
            placeholder="email@exemplo.com"
            placeholderTextColor={cores.textoSecundario}
            value={email}
            onChangeText={(texto) => {
              setEmail(texto);
              setErro('');
              setSucesso('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!enviando}
          />

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          {sucesso ? <Text style={styles.sucesso}>✓ {sucesso}</Text> : null}

          <TouchableOpacity
            style={[styles.botao, enviando && styles.botaoDesabilitado]}
            onPress={enviar}
            disabled={enviando}
          >
            {enviando ? (
              <ActivityIndicator color={cores.textoSobrePrimaria} />
            ) : (
              <Text style={styles.botaoTexto}>Enviar convite</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.botaoFechar}
            onPress={fechar}
            disabled={enviando}
          >
            <Text style={styles.botaoFecharTexto}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: cores.superficie,
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
  },

  titulo: {
    fontSize: 24,
    fontFamily: fontes.titulo,
    color: cores.texto,
    marginBottom: 12,
    textAlign: 'center',
  },

  texto: {
    textAlign: 'center',
    color: cores.textoSecundario,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 18,
  },

  label: {
    alignSelf: 'flex-start',
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
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: cores.superficie,
    color: cores.texto,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 10,
  },

  sucesso: {
    color: cores.online,
    fontFamily: fontes.destaque,
    textAlign: 'center',
    marginBottom: 10,
  },

  botao: {
    width: '100%',
    padding: 15,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },

  botaoDesabilitado: {
    opacity: 0.7,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  botaoFechar: {
    padding: 12,
  },

  botaoFecharTexto: {
    color: cores.textoSecundario,
    fontSize: 15,
  },
});
