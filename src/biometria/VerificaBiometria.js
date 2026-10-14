/*
 * Tela de biometria obrigatória: pede o reconhecimento facial (ou
 * outra biometria) ao abrir o app e ao voltar do segundo plano; 3
 * falhas encerram a sessão.
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
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  autenticarComBiometria,
  lerFalhas,
  MAXIMO_FALHAS,
  proximoPasso,
  registrarFalha,
  temReconhecimentoFacial,
  zerarFalhas,
} from '../dados/biometria';
import { cores, fontes, raio } from '../theme/theme';

/*
 * Tela de bloqueio: nada do app aparece antes da biometria.
 * Abre a biometria sozinha assim que aparece.
 *   sucesso          → onDesbloqueado()
 *   3 falhas         → onEncerrar(mensagem): sessão encerrada, entra
 *                      de novo só com e-mail e senha
 *   cancelar,
 *   bloqueio ou
 *   indisponível     → continua travada, com "Tentar novamente"
 *   "Sair da conta"  → onEncerrar('')
 */
export default function VerificaBiometria({ usuario, onDesbloqueado, onEncerrar }) {
  // verificando | aguardando
  const [etapa, setEtapa] = useState('verificando');
  const [mensagem, setMensagem] = useState('');
  const [facial, setFacial] = useState(true);

  const falhasRef = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  async function tentar() {
    setEtapa('verificando');
    setMensagem('');

    const classificacao = await autenticarComBiometria();
    const passo = proximoPasso(classificacao, falhasRef.current);

    if (classificacao === 'sucesso') {
      await zerarFalhas(usuario.uid).catch(() => {});
    } else if (classificacao === 'falha') {
      falhasRef.current = await registrarFalha(usuario.uid).catch(() => passo.falhas);
    }

    if (!montado.current) return;

    if (passo.acao === 'entrar') {
      onDesbloqueado();
      return;
    }

    if (passo.acao === 'encerrar') {
      onEncerrar(passo.mensagem);
      return;
    }

    setEtapa('aguardando');
    setMensagem(passo.mensagem);
  }

  useEffect(() => {
    let ativo = true;

    Promise.all([lerFalhas(usuario.uid), temReconhecimentoFacial()])
      .then(([falhas, temFacial]) => {
        if (!ativo) return;

        falhasRef.current = falhas;
        setFacial(temFacial);

        // Já esgotou as tentativas (ex.: app fechado no meio): só pela senha.
        if (falhas >= MAXIMO_FALHAS) {
          onEncerrar(proximoPasso('falha', MAXIMO_FALHAS - 1).mensagem);
          return;
        }

        tentar();
      })
      .catch((erro) => {
        console.log('Configuração de biometria indisponível:', erro);

        if (ativo) tentar();
      });

    return () => {
      ativo = false;
    };
  }, [usuario.uid]);

  const icone = facial ? 'face-recognition' : 'fingerprint';

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.nomeApp}>Conecta</Text>

      <View style={styles.icone}>
        <MaterialCommunityIcons name={icone} size={56} color={cores.primaria} />
      </View>

      <Text style={styles.titulo}>Confirme que é você</Text>

      <Text style={styles.descricao}>
        {facial
          ? 'Para proteger sua família, o Conecta pede o reconhecimento facial sempre que você entra.'
          : 'Para proteger sua família, o Conecta pede a biometria do aparelho sempre que você entra.'}
      </Text>

      {etapa === 'verificando' ? (
        <View style={styles.linha}>
          <ActivityIndicator color={cores.primaria} />
          <Text style={styles.texto}>Aguardando biometria...</Text>
        </View>
      ) : (
        <>
          {mensagem ? <Text style={styles.mensagem}>{mensagem}</Text> : null}

          <TouchableOpacity style={styles.botao} onPress={tentar}>
            <MaterialCommunityIcons name={icone} size={20} color={cores.textoSobrePrimaria} />
            <Text style={styles.botaoTexto}>Tentar novamente</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={styles.sair}
        onPress={() => onEncerrar('')}
        disabled={etapa === 'verificando'}
      >
        <Text style={[styles.sairTexto, etapa === 'verificando' && styles.desabilitado]}>
          Sair da conta
        </Text>
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
    marginBottom: 28,
  },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },

  texto: {
    fontSize: 15,
    color: cores.texto,
  },

  mensagem: {
    fontSize: 14,
    lineHeight: 20,
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 16,
  },

  botao: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  sair: {
    alignItems: 'center',
    marginTop: 18,
    padding: 8,
  },

  sairTexto: {
    color: cores.primaria,
    fontSize: 15,
    fontFamily: fontes.destaque,
  },

  desabilitado: {
    opacity: 0.5,
  },
});
