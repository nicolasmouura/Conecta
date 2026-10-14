/*
 * Tela de entrada: boas-vindas, cadastro (nome, e-mail, CPF, telefone
 * e senha; o endereço é pedido depois, em Meu Perfil), login e "Esqueci
 * minha senha", pelo Firebase Authentication.
 */

import { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';

import { auth } from '../config/firebase';
import {
  salvarPerfilUsuario,
  validarCadastro,
} from '../dados/salvarUsuario';
import { zerarFalhas } from '../dados/biometria';
import { guardarSenhaOffline } from '../dados/senhaOffline';
import { useVoltarAndroid } from '../navegacao/voltar';
import { cores, fontes, raio } from '../theme/theme';

/*
 * Login e cadastro por e-mail e senha. Depois daqui o App ainda pede
 * a biometria (VerificaBiometria) antes de liberar o acesso.
 *
 * aviso: mensagem de quando a sessão foi encerrada (ex.: 3 falhas na
 * biometria); abre direto no login mostrando o motivo.
 */
export default function AutenticacaoScreen({ onAutenticado, aviso }) {
  const [tela, setTela] = useState(aviso ? 'login' : 'inicio');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  // Somente no cadastro
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [confirmacao, setConfirmacao] = useState('');

  const [erro, setErro] = useState(aviso || '');
  const [carregando, setCarregando] = useState(false);

  // Voltar do Android no login/cadastro: igual ao "← Voltar".
  useVoltarAndroid(tela !== 'inicio', () => {
    if (!carregando) voltarInicio();
  });

  async function continuar() {
    setErro('');
    setCarregando(true);

    try {
      if (tela === 'cadastro') {
        const erroCadastro = validarCadastro({
          nome,
          email,
          cpf,
          telefone,
          senha,
          confirmacao,
        });

        if (erroCadastro) {
          setErro(erroCadastro);
          setCarregando(false);
          return;
        }

        const resultado = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          senha
        );

        const usuario = {
          uid: resultado.user.uid,
          nome: nome.trim(),
          email: resultado.user.email,
        };

        // Um perfil por CPF: se o CPF já tem conta, o login recém-criado
        // é apagado (não sobra conta sem perfil) e o e-mail fica livre.
        // O endereço não é pedido aqui: fica obrigatório em Meu Perfil.
        try {
          await salvarPerfilUsuario({ ...usuario, cpf, telefone });
        } catch (erroPerfil) {
          if (erroPerfil.message === 'CPF_JA_CADASTRADO') {
            await deleteUser(resultado.user).catch((erroApagar) =>
              console.log('Login sem perfil não apagado:', erroApagar.code || erroApagar.message)
            );
          }

          throw erroPerfil;
        }

        // Link de confirmação do e-mail: o app só libera depois dele
        // (VerificarEmail). Se o envio falhar, dá para reenviar lá.
        await sendEmailVerification(resultado.user).catch((erroEnvio) =>
          console.log('E-mail de confirmação não enviado:', erroEnvio.code || erroEnvio.message)
        );

        // A senha fica no Firebase Authentication; no aparelho, só o
        // hash para encerrar o SOS sem internet.
        await guardarSenhaOffline(usuario.uid, senha).catch((erroHash) =>
          console.log('Hash da senha não guardado:', erroHash.message)
        );

        console.log('Conta criada:', usuario.uid);

        onAutenticado(usuario);
      } else {
        const resultado = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          senha
        );

        console.log('Login realizado:', resultado.user.uid);

        // Senha correta: zera as falhas de biometria deste usuário.
        await zerarFalhas(resultado.user.uid).catch(() => {});
        await guardarSenhaOffline(resultado.user.uid, senha).catch((erroHash) =>
          console.log('Hash da senha não guardado:', erroHash.message)
        );

        onAutenticado(resultado.user);
      }
    } catch (e) {
      // Senha errada, e-mail já usado etc. são respostas esperadas,
      // não falhas do app: não abrem a caixa vermelha de erro.
      if (e.code?.startsWith('auth/') || e.message === 'CPF_JA_CADASTRADO') {
        console.log('Autenticação recusada:', e.code || e.message);
      } else {
        console.error('Erro na autenticação:', e);
      }

      if (e.message === 'CPF_JA_CADASTRADO') {
        setErro('Este CPF já está cadastrado em outra conta.');
      } else if (e.code === 'auth/email-already-in-use') {
        setErro('Este e-mail já possui uma conta.');
      } else if (e.code === 'auth/invalid-email') {
        setErro('Digite um e-mail válido.');
      } else if (e.code === 'auth/weak-password') {
        setErro('A senha precisa ter pelo menos 6 caracteres.');
      } else if (
        e.code === 'auth/invalid-credential' ||
        e.code === 'auth/wrong-password'
      ) {
        setErro('E-mail ou senha incorretos.');
      } else if (e.code === 'auth/user-not-found') {
        setErro('Não há conta com este e-mail. Volte e toque em "Se cadastrar".');
      } else if (e.code === 'auth/too-many-requests') {
        setErro('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else if (e.code === 'auth/network-request-failed') {
        setErro('Sem conexão. Verifique sua internet e tente novamente.');
      } else {
        setErro('Não foi possível continuar. Tente novamente.');
      }
    }

    setCarregando(false);
  }

  async function esqueciSenha() {
    setErro('');

    if (!email.trim()) {
      setErro('Digite seu e-mail para redefinir a senha.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());

      Alert.alert(
        'Verifique seu e-mail',
        'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.'
      );
    } catch (e) {
      if (e.code === 'auth/invalid-email') {
        setErro('Digite um e-mail válido.');
      } else if (e.code === 'auth/network-request-failed') {
        setErro('Sem conexão. Verifique sua internet e tente novamente.');
      } else {
        setErro('Não foi possível enviar o e-mail. Tente novamente.');
      }
    }
  }

  function abrirTela(tipo) {
    setErro('');
    setTela(tipo);
  }

  function voltarInicio() {
    setErro('');
    setTela('inicio');
  }

  if (tela === 'inicio') {
    return (
      <View style={styles.container}>
        <View style={styles.inicio}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.nomeApp}>
            Conecta
          </Text>

          <Text style={styles.bemVindo}>
            Bem-vindo!
          </Text>

          <Text style={styles.descricao}>
            Conecte sua família e acompanhe a localização
            de quem é importante para você.
          </Text>

          <View style={styles.botoesInicio}>
            <TouchableOpacity
              style={styles.botaoPrincipal}
              onPress={() => abrirTela('login')}
            >
              <Text style={styles.botaoPrincipalTexto}>
                Entrar no app
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.botaoSecundario}
              onPress={() => abrirTela('cadastro')}
            >
              <Text style={styles.botaoSecundarioTexto}>
                Se cadastrar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const cadastro = tela === 'cadastro';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.formularioScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logoFormulario}
          resizeMode="contain"
        />

        <Text style={styles.nomeAppFormulario}>
          Conecta
        </Text>

        <Text style={styles.tituloFormulario}>
          {cadastro ? 'Criar sua conta' : 'Entrar no app'}
        </Text>

        <Text style={styles.subtituloFormulario}>
          {cadastro
            ? 'Preencha seus dados para começar.'
            : 'Entre para continuar usando o Conecta.'}
        </Text>

        {cadastro && (
          <>
            <Text style={styles.label}>
              Nome completo
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Seu nome completo"
              placeholderTextColor={cores.textoSecundario}
              value={nome}
              onChangeText={setNome}
              autoCapitalize="words"
              maxLength={60}
            />
          </>
        )}

        <Text style={styles.label}>
          E-mail
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Seu e-mail"
          placeholderTextColor={cores.textoSecundario}
          value={email}
          onChangeText={(texto) => {
            setEmail(texto);
            setErro('');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        {cadastro && (
          <>
            <Text style={styles.label}>
              CPF
            </Text>

            <TextInput
              style={styles.input}
              placeholder="000.000.000-00"
              placeholderTextColor={cores.textoSecundario}
              value={cpf}
              onChangeText={setCpf}
              keyboardType="number-pad"
              maxLength={14}
            />

            <Text style={styles.label}>
              Telefone
            </Text>

            <TextInput
              style={styles.input}
              placeholder="(21) 98765-4321"
              placeholderTextColor={cores.textoSecundario}
              value={telefone}
              onChangeText={setTelefone}
              keyboardType="phone-pad"
              maxLength={20}
            />

          </>
        )}

        <Text style={styles.label}>
          Senha
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Sua senha"
          placeholderTextColor={cores.textoSecundario}
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
        />

        {cadastro && (
          <>
            <Text style={styles.label}>
              Confirmar senha
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Digite a senha novamente"
              placeholderTextColor={cores.textoSecundario}
              value={confirmacao}
              onChangeText={setConfirmacao}
              secureTextEntry
            />
          </>
        )}

        {erro ? (
          <Text style={styles.erro}>
            {erro}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[
            styles.botaoPrincipal,
            carregando && styles.botaoDesabilitado,
          ]}
          onPress={continuar}
          disabled={carregando}
        >
          <Text style={styles.botaoPrincipalTexto}>
            {carregando
              ? 'Aguarde...'
              : cadastro
              ? 'Criar minha conta'
              : 'Entrar no app'}
          </Text>
        </TouchableOpacity>

        {!cadastro && (
          <TouchableOpacity
            style={styles.botaoVoltar}
            onPress={esqueciSenha}
            disabled={carregando}
          >
            <Text style={styles.botaoVoltarTexto}>
              Esqueci minha senha
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.botaoVoltar}
          onPress={voltarInicio}
          disabled={carregando}
        >
          <Text style={styles.botaoVoltarTexto}>
            ← Voltar
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },

  inicio: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  logo: {
    width: 125,
    height: 125,
    marginBottom: 8,
  },

  nomeApp: {
    fontSize: 42,
    fontFamily: fontes.titulo,
    color: cores.primaria,
    marginBottom: 18,
  },

  bemVindo: {
    fontSize: 27,
    fontFamily: fontes.titulo,
    color: cores.texto,
    marginBottom: 12,
  },

  descricao: {
    width: '90%',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: cores.textoSecundario,
    marginBottom: 34,
  },

  botoesInicio: {
    width: '100%',
    gap: 12,
  },

  botaoPrincipal: {
    width: '100%',
    backgroundColor: cores.primaria,
    paddingVertical: 16,
    borderRadius: raio.pilula,
    alignItems: 'center',
  },

  botaoPrincipalTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  botaoSecundario: {
    width: '100%',
    backgroundColor: cores.superficie,
    borderWidth: 1.5,
    borderColor: cores.primaria,
    paddingVertical: 15,
    borderRadius: raio.pilula,
    alignItems: 'center',
  },

  botaoSecundarioTexto: {
    color: cores.primaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  formularioScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 25,
    paddingVertical: 35,
  },

  logoFormulario: {
    width: 75,
    height: 75,
    alignSelf: 'center',
    marginBottom: 2,
  },

  nomeAppFormulario: {
    fontSize: 27,
    fontFamily: fontes.titulo,
    color: cores.primaria,
    textAlign: 'center',
    marginBottom: 22,
  },

  tituloFormulario: {
    fontSize: 26,
    fontFamily: fontes.titulo,
    color: cores.texto,
    textAlign: 'center',
    marginBottom: 8,
  },

  subtituloFormulario: {
    fontSize: 15,
    textAlign: 'center',
    color: cores.textoSecundario,
    marginBottom: 28,
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
    fontSize: 14,
  },

  botaoDesabilitado: {
    opacity: 0.7,
  },

  botaoVoltar: {
    alignItems: 'center',
    marginTop: 18,
    padding: 8,
  },

  botaoVoltarTexto: {
    color: cores.primaria,
    fontSize: 15,
    fontFamily: fontes.destaque,
  },
});