import { useEffect, useState } from 'react';

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import {
  AppState,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StatusBar } from 'expo-status-bar';

import {
  useFonts,
  Poppins_700Bold,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';

import {
  doc,
  getDoc,
} from './src/armazenamento/bancoLocal';

import { onAuthStateChanged, signOut } from './src/armazenamento/contasLocais';

import { auth, db } from './src/config/armazenamento';

import Menu from './Components/Menu';
import TelaMapa from './src/mapa/TelaMapa';
import FamiliaScreen from './src/familia/FamiliaScreen';
import PerfilScreen from './src/perfil/PerfilScreen';
import HistoricoScreen from './src/historico/HistoricoScreen';
import SOSScreen from './src/sos/SOSScreen';

import AutenticacaoScreen from './src/autenticacao/AutenticacaoScreen';
import VerificaBiometria from './src/biometria/VerificaBiometria';
import { garantirEntradaDiretorio } from './src/dados/salvarUsuario';
import GrupoScreen from './src/grupo/GrupoScreen';
import { useCompartilharLocalizacao } from './src/mapa/compartilharLocalizacao';
import { useVoltarAndroid } from './src/navegacao/voltar';
import BotaoMenu from './src/navegacao/BotaoMenu';

import { cores } from './src/theme/theme';

// Tempo fora do app a partir do qual a biometria é pedida de novo.
// A folga evita pedir após diálogos rápidos do sistema (ex.: permissão
// de localização no Android, que também coloca o app em segundo plano).
const TOLERANCIA_SEGUNDO_PLANO = 10 * 1000;

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_700Bold,
    Poppins_600SemiBold,
  });

  // Usuário liberado (já passou pela biometria).
  const [usuario, setUsuario] = useState(null);

  // Biometria obrigatória em toda entrada:
  //   usuarioPendente → sessão restaurada ou login/cadastro por senha,
  //                     aguardando a biometria para liberar o app;
  //   bloqueado       → app travado de novo ao voltar do segundo plano.
  const [restaurandoSessao, setRestaurandoSessao] = useState(true);
  const [usuarioPendente, setUsuarioPendente] = useState(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [avisoLogin, setAvisoLogin] = useState('');
  const [perfil, setPerfil] = useState(null);
  const [grupoId, setGrupoId] = useState(null);
  const [temGrupo, setTemGrupo] = useState(false);
  const [pulouGrupo, setPulouGrupo] = useState(false);
  const [verificandoGrupo, setVerificandoGrupo] = useState(false);
  const [tela, setTela] = useState('menu');

  // Subtela que ocupa a tela inteira (câmera do perfil): esconde o
  // "‹ Menu", que ficaria por cima do botão de fechar dela.
  const [telaCheia, setTelaCheia] = useState(false);

  useEffect(() => {
    async function verificarGrupo() {
      if (!usuario) {
        return;
      }

      try {
        setVerificandoGrupo(true);

        const referencia = doc(
          db,
          'usuarios',
          usuario.uid
        );

        const resultado = await getDoc(
          referencia
        );

        if (resultado.exists()) {
          const dadosUsuario = resultado.data();

          setPerfil({
            uid: usuario.uid,
            nome: dadosUsuario.nome,
            email: dadosUsuario.email,
          });

          // Contas antigas: entrada no índice de convites (Etapa 9).
          garantirEntradaDiretorio(usuario.uid).catch((erro) =>
            console.log(
              'Índice de convites não atualizado:',
              erro.code || erro.message
            )
          );

          if (dadosUsuario.grupoId) {
            console.log(
              'Grupo encontrado:',
              dadosUsuario.grupoId
            );

            setGrupoId(
              dadosUsuario.grupoId
            );

            setTemGrupo(true);
          } else {
            console.log(
              'Usuário ainda não possui grupo.'
            );

            setGrupoId(null);
            setTemGrupo(false);
          }
        } else {
          console.log(
            'Perfil do usuário não encontrado.'
          );

          setPerfil({
            uid: usuario.uid,
            nome:
              usuario.nome ||
              usuario.displayName ||
              'Usuário',
            email: usuario.email,
          });

          setGrupoId(null);
          setTemGrupo(false);
        }
      } catch (e) {
        console.error(
          'Erro ao verificar grupo:',
          e
        );

        setPerfil((perfilAtual) =>
          perfilAtual || {
            uid: usuario.uid,
            nome:
              usuario.nome ||
              usuario.displayName ||
              'Usuário',
            email: usuario.email,
          }
        );

        setTemGrupo(false);
      } finally {
        setVerificandoGrupo(false);
      }
    }

    verificarGrupo();
  }, [usuario]);

  // Só a PRIMEIRA emissão (sessão restaurada ao abrir) é tratada aqui:
  // a sessão guardada fica travada até a biometria ser confirmada.
  // Login, cadastro e "Sair" continuam pelos fluxos das telas.
  useEffect(() => {
    let primeira = true;

    const cancelar = onAuthStateChanged(auth, (usuarioFirebase) => {
      if (!primeira) return;
      primeira = false;

      if (usuarioFirebase) {
        setUsuarioPendente(usuarioFirebase);
      }

      setRestaurandoSessao(false);
    });

    return cancelar;
  }, []);

  // Voltou do segundo plano depois da tolerância: trava de novo.
  // Enquanto travado não escuta, para a própria biometria (que pode
  // tirar o app do primeiro plano) não disparar um novo bloqueio.
  useEffect(() => {
    if (!usuario || bloqueado) return;

    let saiuEm = null;

    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'background') {
        saiuEm = Date.now();
      } else if (estado === 'active' && saiuEm !== null) {
        if (Date.now() - saiuEm >= TOLERANCIA_SEGUNDO_PLANO) {
          setBloqueado(true);
        }

        saiuEm = null;
      }
    });

    return () => assinatura.remove();
  }, [usuario, bloqueado]);

  // Compartilha a localização enquanto o app estiver em uso
  // (somente para usuário autenticado que pertence a uma família).
  const localizacao = useCompartilharLocalizacao(
    perfil,
    temGrupo ? grupoId : null
  );

  // Voltar do Android nas telas abertas pelo Menu: volta ao Menu, como
  // o "‹ Menu". As subtelas registram o próprio voltar ao abrir e têm
  // prioridade. No Menu, o voltar segue o padrão do Android.
  useVoltarAndroid(
    Boolean(usuario) && !bloqueado && !usuarioPendente && tela !== 'menu',
    () => setTela('menu')
  );

  if (!fontsLoaded) {
    return null;
  }

  const voltarMenu = () => {
    setTela('menu');
  };

  function sairDoAplicativo() {
    setUsuario(null);
    setUsuarioPendente(null);
    setBloqueado(false);
    setPerfil(null);
    setGrupoId(null);
    setTemGrupo(false);
    setPulouGrupo(false);
    setTela('menu');
  }

  function desbloquear() {
    if (usuarioPendente) {
      console.log('Biometria confirmada:', usuarioPendente.uid);

      setUsuario(usuarioPendente);
      setUsuarioPendente(null);
    }

    setBloqueado(false);
  }

  // Sair pela tela de bloqueio ou esgotar as tentativas de biometria:
  // encerra a sessão; a próxima entrada é por e-mail e senha.
  async function encerrarSessao(mensagem) {
    await signOut(auth).catch((erro) =>
      console.error('Erro ao encerrar sessão:', erro)
    );

    sairDoAplicativo();
    setAvisoLogin(mensagem);
  }

  if (!usuario && restaurandoSessao) {
    return (
      <SafeAreaProvider>
        <View style={styles.carregandoContainer}>
          <Text style={styles.carregandoTexto}>
            Carregando...
          </Text>

          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  const usuarioTravado =
    usuarioPendente || (bloqueado ? usuario : null);

  if (usuarioTravado) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <VerificaBiometria
            usuario={usuarioTravado}
            onDesbloqueado={desbloquear}
            onEncerrar={encerrarSessao}
          />

          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!usuario) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <AutenticacaoScreen
            aviso={avisoLogin}
            onAutenticado={(usuarioFirebase) => {
              console.log(
                'Usuário autenticado:',
                usuarioFirebase.uid
              );

              // Senha conferida; falta a biometria.
              setAvisoLogin('');
              setUsuarioPendente(
                usuarioFirebase
              );
            }}
          />

          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (verificandoGrupo || !perfil) {
    return (
      <SafeAreaProvider>
        <View
          style={
            styles.carregandoContainer
          }
        >
          <Text
            style={
              styles.carregandoTexto
            }
          >
            Verificando grupo familiar...
          </Text>

          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!temGrupo && !pulouGrupo) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <GrupoScreen
            usuario={perfil}
            onGrupoConcluido={(
              novoGrupoId
            ) => {
              console.log(
                'Grupo concluído.'
              );

              setGrupoId(
                novoGrupoId
              );

              setTemGrupo(true);
            }}
            onPular={() =>
              setPulouGrupo(true)
            }
          />

          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  let conteudo;

  if (tela === 'mapa') {
    conteudo = (
      <TelaMapa
        usuario={perfil}
        grupoId={grupoId}
        localizacao={localizacao}
      />
    );
  } else if (tela === 'familia') {
    conteudo = (
      <FamiliaScreen
        grupoId={grupoId}
        usuario={perfil}
        onGrupoConcluido={(
          novoGrupoId
        ) => {
          setGrupoId(
            novoGrupoId
          );

          setTemGrupo(true);
        }}
      />
    );
  } else if (tela === 'perfil') {
    conteudo = (
      <PerfilScreen
        usuario={perfil}
        posicaoAtual={localizacao.coordenadas}
        grupoId={temGrupo ? grupoId : null}
        onTelaCheia={setTelaCheia}
        onSair={sairDoAplicativo}
        onPerfilAtualizado={({ nome }) =>
          setPerfil((atual) => ({
            ...atual,
            nome,
          }))
        }
      />
    );
  } else if (tela === 'sos') {
    conteudo = (
      <SOSScreen
        usuario={perfil}
        grupoId={temGrupo ? grupoId : null}
      />
    );
  } else if (tela === 'historico') {
    conteudo = (
      <HistoricoScreen
        usuario={perfil}
        grupoId={temGrupo ? grupoId : null}
      />
    );
  } else {
    conteudo = (
      <Menu
        onSelect={setTela}
        nome={perfil?.nome}
        localizacao={localizacao}
        grupoId={temGrupo ? grupoId : null}
        uidAtual={perfil?.uid}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {conteudo}

        {tela !== 'menu' && !telaCheia && (
          <BotaoMenu onPress={voltarMenu} />
        )}

        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },

  carregandoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: cores.fundo,
  },

  carregandoTexto: {
    fontSize: 16,
    color: cores.textoSecundario,
  },
});