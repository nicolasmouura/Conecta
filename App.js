/*
 * Raiz do app: controla a sessão (login, biometria e confirmação do
 * e-mail), carrega o perfil e a família, liga o compartilhamento da
 * localização e troca entre o Menu e as telas (Minha Família, Mapa,
 * Histórico, Meu Perfil e SOS).
 */

import { useEffect, useState } from 'react';

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import {
  Alert,
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
} from 'firebase/firestore';

import { onAuthStateChanged, signOut } from 'firebase/auth';

import { auth, db } from './src/config/firebase';

import Menu from './Components/Menu';
import TelaMapa from './src/mapa/TelaMapa';
import FamiliaScreen from './src/familia/FamiliaScreen';
import PerfilScreen from './src/perfil/PerfilScreen';
import HistoricoScreen from './src/historico/HistoricoScreen';
import SOSScreen from './src/sos/SOSScreen';

import AutenticacaoScreen from './src/autenticacao/AutenticacaoScreen';
import VerificaBiometria from './src/biometria/VerificaBiometria';
import VerificarEmail from './src/autenticacao/VerificarEmail';
import {
  ativarBiometria,
  biometriaAtiva,
  desativarBiometria,
} from './src/dados/biometria';
import { garantirEntradaDiretorio } from './src/dados/salvarUsuario';
import { apagarSenhaOffline } from './src/dados/senhaOffline';
import {
  apagarDadosLocais,
  comTempoLimite,
  gravarLocal,
  lerLocal,
} from './src/dados/armazenamentoLocal';
import { processarFila } from './src/dados/filaEnvio';
import { buscarTelefonesDaFamilia } from './src/dados/smsSOS';
import GrupoScreen from './src/grupo/GrupoScreen';
import { useCompartilharLocalizacao } from './src/mapa/compartilharLocalizacao';
import { useVoltarAndroid } from './src/navegacao/voltar';
import BotaoMenu from './src/navegacao/BotaoMenu';
import AvisoOffline from './src/navegacao/AvisoOffline';

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

  // Biometria opcional (escolhida depois do cadastro ou em Segurança):
  //   usuarioPendente   → sessão restaurada ao abrir, aguardando a
  //                       biometria para liberar o app;
  //   bloqueado         → app travado de novo ao voltar do segundo plano;
  //   biometriaLigada   → a pessoa escolheu entrar com biometria;
  //   oferecerBiometria → conta recém-criada: perguntar se quer usar.
  const [restaurandoSessao, setRestaurandoSessao] = useState(true);
  const [usuarioPendente, setUsuarioPendente] = useState(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [biometriaLigada, setBiometriaLigada] = useState(false);
  const [oferecerBiometria, setOferecerBiometria] = useState(false);
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

  // Meu Perfil sem endereço: não dá para sair de lá antes de cadastrar.
  // pedidoEndereco muda para o perfil reabrir o cadastro da casa.
  const [perfilSemEndereco, setPerfilSemEndereco] = useState(false);
  const [pedidoEndereco, setPedidoEndereco] = useState(0);

  // E-mail confirmado: o app só abre depois disso (VerificarEmail).
  // emailConfirmado marca a confirmação feita nesta sessão (o objeto
  // do Firebase muda sem avisar o React).
  const [emailConfirmado, setEmailConfirmado] = useState(false);
  const emailOk =
    emailConfirmado || auth.currentUser?.emailVerified === true;

  useEffect(() => {
    async function verificarGrupo() {
      if (!usuario || !emailOk) {
        return;
      }

      try {
        setVerificandoGrupo(true);

        const referencia = doc(
          db,
          'usuarios',
          usuario.uid
        );

        const resultado = await comTempoLimite(
          getDoc(referencia)
        );

        if (resultado.exists()) {
          const dadosUsuario = resultado.data();

          setPerfil({
            uid: usuario.uid,
            nome: dadosUsuario.nome,
            email: dadosUsuario.email,
          });

          // Cópia para abrir o app sem internet (nome e família).
          gravarLocal('sessao', {
            uid: usuario.uid,
            nome: dadosUsuario.nome,
            email: dadosUsuario.email,
            grupoId: dadosUsuario.grupoId || null,
          });

          // Telefones da família guardados para o SOS por SMS offline.
          if (dadosUsuario.grupoId) {
            buscarTelefonesDaFamilia(dadosUsuario.grupoId, usuario.uid);
          }

          // Entrada no índice de convites: criada aqui, depois que o
          // e-mail foi confirmado (no cadastro ainda não estava).
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
          // Login sem perfil (ex.: conta apagada pela metade): não entra
          // como "Usuário" sem nome; volta para o login.
          console.log(
            'Perfil do usuário não encontrado.'
          );

          encerrarSessao(
            'Não encontramos os dados desta conta. Entre de novo ou crie uma conta.'
          );
          return;
        }
      } catch (e) {
        // Sem internet: entra com a última cópia (nome e família).
        const copia = await lerLocal('sessao');

        if (copia?.uid === usuario.uid) {
          console.log('Sem conexão: usando os dados guardados no aparelho.');

          setPerfil((perfilAtual) =>
            perfilAtual || {
              uid: copia.uid,
              nome: copia.nome,
              email: copia.email,
            }
          );

          setGrupoId(copia.grupoId);
          setTemGrupo(Boolean(copia.grupoId));
          return;
        }

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
  }, [usuario, emailOk]);

  // Reenvia o que ficou na fila do aparelho (SOS, "Estou bem",
  // histórico) quando o app abriu sem ter mandado tudo.
  useEffect(() => {
    if (usuario?.uid && emailOk) {
      processarFila(usuario.uid);
    }
  }, [usuario?.uid, emailOk]);

  // Só a PRIMEIRA emissão (sessão restaurada ao abrir) é tratada aqui:
  // com a biometria ligada, a sessão fica travada até ela ser confirmada;
  // sem ela, entra direto. Login, cadastro e "Sair" continuam pelos
  // fluxos das telas.
  useEffect(() => {
    let primeira = true;

    const cancelar = onAuthStateChanged(auth, async (usuarioFirebase) => {
      if (!primeira) return;
      primeira = false;

      if (usuarioFirebase) {
        const ligada = await biometriaAtiva(usuarioFirebase.uid);

        setBiometriaLigada(ligada);

        if (ligada) {
          setUsuarioPendente(usuarioFirebase);
        } else {
          setUsuario(usuarioFirebase);
        }
      }

      setRestaurandoSessao(false);
    });

    return cancelar;
  }, []);

  // Voltou do segundo plano depois da tolerância: trava de novo.
  // Enquanto travado não escuta, para a própria biometria (que pode
  // tirar o app do primeiro plano) não disparar um novo bloqueio.
  useEffect(() => {
    if (!usuario || bloqueado || !biometriaLigada) return;

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
  }, [usuario, bloqueado, biometriaLigada]);

  // Conta recém-criada, já dentro do app: pergunta uma vez se a pessoa
  // quer entrar com biometria (confirma a biometria antes de ligar).
  useEffect(() => {
    if (!oferecerBiometria || !usuario || !emailOk || !perfil) return;

    setOferecerBiometria(false);

    const uid = usuario.uid;

    async function ligar() {
      const { ativada, mensagem } = await ativarBiometria(uid);

      if (ativada) {
        setBiometriaLigada(true);
        Alert.alert(
          'Biometria ativada',
          'Ela será pedida sempre que você abrir o Conecta.'
        );
      } else {
        Alert.alert('Biometria não ativada', mensagem);
      }
    }

    Alert.alert(
      'Entrar com biometria?',
      'Você pode usar o reconhecimento facial ou a digital do aparelho para entrar no Conecta. Dá para mudar depois em Meu Perfil → Configurações → Segurança.',
      [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Usar biometria', onPress: ligar },
      ]
    );
  }, [oferecerBiometria, usuario, emailOk, perfil]);

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
    () => voltarMenu()
  );

  if (!fontsLoaded) {
    return null;
  }

  function voltarMenu() {
    if (tela === 'perfil' && perfilSemEndereco) {
      Alert.alert(
        'Endereço obrigatório',
        'Cadastre o endereço da sua casa antes de sair de Meu Perfil.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Cadastrar',
            onPress: () => setPedidoEndereco((pedido) => pedido + 1),
          },
        ]
      );
      return;
    }

    setTela('menu');
  }

  // O mapa mostra a família: sem uma, leva para criar ou entrar.
  function abrirTela(chave) {
    if (chave === 'mapa' && !temGrupo) {
      Alert.alert(
        'Mapa',
        'Para ver o mapa, crie uma família ou entre em uma.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Minha Família', onPress: () => setTela('familia') },
        ]
      );
      return;
    }

    setTela(chave);
  }

  function sairDoAplicativo() {
    setEmailConfirmado(false);

    apagarSenhaOffline().catch((erro) =>
      console.log('Hash da senha não apagado:', erro.message)
    );

    apagarDadosLocais().catch((erro) =>
      console.log('Cópias locais não apagadas:', erro.message)
    );

    setUsuario(null);
    setUsuarioPendente(null);
    setBloqueado(false);
    setBiometriaLigada(false);
    setOferecerBiometria(false);
    setPerfilSemEndereco(false);
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
            onAutenticado={async (usuarioFirebase, opcoes) => {
              console.log(
                'Usuário autenticado:',
                usuarioFirebase.uid
              );

              // Senha conferida: entra direto. A biometria só é pedida
              // depois (segundo plano, próxima abertura) se a pessoa a
              // tiver ligado; conta nova é perguntada se quer usar.
              setAvisoLogin('');

              if (opcoes?.contaNova) {
                setBiometriaLigada(false);
                setOferecerBiometria(true);
              } else {
                setBiometriaLigada(
                  await biometriaAtiva(usuarioFirebase.uid)
                );
              }

              setUsuario(usuarioFirebase);
            }}
          />

          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!emailOk) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <VerificarEmail
            email={auth.currentUser?.email || usuario.email}
            onConfirmado={() => setEmailConfirmado(true)}
            onSair={() => encerrarSessao('')}
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
        onSaiu={() => {
          // Sem família: volta para criar uma ou aceitar um convite.
          setGrupoId(null);
          setTemGrupo(false);
          setPulouGrupo(false);
          setTela('menu');
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
        onEnderecoPendente={setPerfilSemEndereco}
        pedidoEndereco={pedidoEndereco}
        biometriaLigada={biometriaLigada}
        onBiometriaAlterada={setBiometriaLigada}
        onSair={sairDoAplicativo}
        onContaExcluida={() => {
          desativarBiometria(perfil.uid).catch(() => {});
          sairDoAplicativo();
          setAvisoLogin('Sua conta foi excluída.');
        }}
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
        posicaoAtual={localizacao.coordenadas}
        posicaoEm={localizacao.atualizadoEm}
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
        onSelect={abrirTela}
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

        {/* No Menu o aviso é uma faixa dentro da tela (Menu.js). */}
        {tela !== 'menu' && !telaCheia && <AvisoOffline />}

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