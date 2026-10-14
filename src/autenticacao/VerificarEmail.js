/*
 * Tela "Confirme seu e-mail": o app só abre depois que a pessoa toca
 * no link enviado pelo Firebase (Já confirmei, Reenviar e-mail, Sair
 * da conta).
 */

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { reload, sendEmailVerification } from 'firebase/auth';

import { auth } from '../config/firebase';
import { cores, fontes, raio } from '../theme/theme';

// Reenviar no máximo a cada 60 s (o Firebase também limita).
const ESPERA_REENVIO = 60;

/*
 * Tela de confirmação do e-mail. O app só libera depois que a pessoa
 * toca no link que o Firebase enviou (no cadastro ou em "Reenviar").
 * Sem isso, alguém poderia criar conta com o e-mail de outra pessoa e
 * receber os convites dela (firestore.rules: emailVerificado).
 */
export default function VerificarEmail({ email, onConfirmado, onSair }) {
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [espera, setEspera] = useState(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;

    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (espera <= 0) return undefined;

    const contador = setTimeout(() => setEspera((atual) => atual - 1), 1000);

    return () => clearTimeout(contador);
  }, [espera]);

  async function jaConfirmei() {
    try {
      setOcupado(true);
      setErro('');
      setMensagem('');

      await reload(auth.currentUser);

      if (!auth.currentUser?.emailVerified) {
        if (montado.current) {
          setErro('Ainda não recebemos a confirmação. Toque no link do e-mail e tente de novo.');
        }
        return;
      }

      // Novo token: as regras do Firestore passam a ver o e-mail confirmado.
      await auth.currentUser.getIdToken(true);

      onConfirmado();
    } catch (e) {
      console.log('Confirmação do e-mail não verificada:', e.code || e.message);

      if (montado.current) {
        setErro(
          e.code === 'auth/network-request-failed'
            ? 'Sem conexão. Verifique sua internet e tente novamente.'
            : 'Não foi possível verificar agora. Tente novamente.'
        );
      }
    } finally {
      if (montado.current) setOcupado(false);
    }
  }

  async function reenviar() {
    try {
      setOcupado(true);
      setErro('');
      setMensagem('');

      await sendEmailVerification(auth.currentUser);

      if (montado.current) {
        setMensagem('E-mail enviado. Confira também a caixa de spam.');
        setEspera(ESPERA_REENVIO);
      }
    } catch (e) {
      console.log('E-mail de confirmação não enviado:', e.code || e.message);

      if (montado.current) {
        if (e.code === 'auth/too-many-requests') {
          setErro('Muitos envios seguidos. Aguarde alguns minutos e tente novamente.');
        } else if (e.code === 'auth/network-request-failed') {
          setErro('Sem conexão. Verifique sua internet e tente novamente.');
        } else {
          setErro('Não foi possível enviar o e-mail. Tente novamente.');
        }
      }
    } finally {
      if (montado.current) setOcupado(false);
    }
  }

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.nomeApp}>Conecta</Text>

      <View style={styles.icone}>
        <Feather name="mail" size={48} color={cores.primaria} />
      </View>

      <Text style={styles.titulo}>Confirme seu e-mail</Text>

      <Text style={styles.descricao}>
        Enviamos um link de confirmação para{' '}
        <Text style={styles.email}>{email}</Text>. Abra o e-mail, toque no
        link e depois volte aqui.
      </Text>

      {mensagem ? <Text style={styles.mensagem}>{mensagem}</Text> : null}
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      <TouchableOpacity
        style={[styles.botao, ocupado && styles.desabilitado]}
        onPress={jaConfirmei}
        disabled={ocupado}
      >
        {ocupado ? (
          <ActivityIndicator color={cores.textoSobrePrimaria} />
        ) : (
          <Text style={styles.botaoTexto}>Já confirmei</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secundario}
        onPress={reenviar}
        disabled={ocupado || espera > 0}
      >
        <Text style={[styles.secundarioTexto, (ocupado || espera > 0) && styles.textoDesabilitado]}>
          {espera > 0 ? `Reenviar e-mail (${espera} s)` : 'Reenviar e-mail'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secundario} onPress={onSair} disabled={ocupado}>
        <Text style={[styles.sairTexto, ocupado && styles.textoDesabilitado]}>Sair da conta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    backgroundColor: cores.fundo,
  },

  logo: {
    width: 75,
    height: 75,
    marginBottom: 2,
  },

  nomeApp: {
    fontSize: 27,
    fontFamily: fontes.titulo,
    color: cores.primaria,
    marginBottom: 28,
  },

  icone: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.superficieAlternativa,
    marginBottom: 20,
  },

  titulo: {
    fontSize: 24,
    fontFamily: fontes.titulo,
    color: cores.texto,
    textAlign: 'center',
    marginBottom: 8,
  },

  descricao: {
    fontSize: 15,
    lineHeight: 22,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginBottom: 24,
  },

  email: {
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  mensagem: {
    fontSize: 14,
    lineHeight: 20,
    color: cores.online,
    textAlign: 'center',
    marginBottom: 16,
  },

  erro: {
    fontSize: 14,
    lineHeight: 20,
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 16,
  },

  botao: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  desabilitado: {
    opacity: 0.7,
  },

  secundario: {
    alignItems: 'center',
    marginTop: 14,
    padding: 8,
  },

  secundarioTexto: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.primaria,
  },

  sairTexto: {
    fontSize: 15,
    color: cores.textoSecundario,
  },

  textoDesabilitado: {
    opacity: 0.5,
  },
});
