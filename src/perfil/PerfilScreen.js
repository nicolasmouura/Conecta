/*
 * Tela Meu Perfil: dados do usuário, troca da foto (câmera ou galeria),
 * endereço obrigatório (abre o cadastro da casa enquanto não houver) e
 * Configurações.
 */

import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Feather } from '@expo/vector-icons';

import * as ImagePicker from 'expo-image-picker';

import { signOut } from 'firebase/auth';

import DadosUsuario from './DadosUsuario';
import Configuracoes from './Configuracoes';
import { useEspacoTopo } from '../navegacao/BotaoMenu';
import CameraScreen from '../camera/CameraScreen';
import EditarLugar from '../lugares/EditarLugar';

import { auth } from '../config/firebase';
import {
  atualizarPerfil,
  buscarPerfil,
  salvarFotoPerfil,
} from '../dados/salvarUsuario';
import { gerarMiniatura } from '../dados/fotoPerfil';
import { salvarLugar, TIPOS_LUGAR } from '../dados/lugares';
import {
  cores,
  fontes,
  raio,
} from '../theme/theme';

const TIPO_CASA = TIPOS_LUGAR.find((tipo) => tipo.id === 'casa');

export default function PerfilScreen({
  usuario,
  onSair,
  onContaExcluida,
  onPerfilAtualizado,
  posicaoAtual,
  grupoId,
  onTelaCheia,
}) {
  // Título abaixo do "‹ Menu" (que acompanha a área segura).
  const espacoTopo = useEspacoTopo(60);

  const [abrirCamera, setAbrirCamera] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);

  // Dados pessoais vindos de usuarios/{uid}
  const [dadosPerfil, setDadosPerfil] = useState(null);
  const [erroPerfil, setErroPerfil] = useState('');

  // Endereço obrigatório: sem ele, o cadastro da casa abre sozinho ao
  // entrar aqui (e de novo pelo aviso, se a pessoa fechar).
  const [cadastroCasaAberto, setCadastroCasaAberto] = useState(false);
  const semEndereco = Boolean(dadosPerfil) && !dadosPerfil.enderecoDetalhado;

  // Câmera aberta: o App esconde o "‹ Menu" (a câmera tem o próprio "x").
  useEffect(() => {
    onTelaCheia?.(abrirCamera);

    return () => onTelaCheia?.(false);
  }, [abrirCamera, onTelaCheia]);

  useEffect(() => {
    let ativo = true;

    async function carregarPerfil() {
      if (!usuario?.uid) {
        return;
      }

      try {
        setErroPerfil('');

        const perfilSalvo =
          await buscarPerfil(usuario.uid);

        if (ativo) {
          setDadosPerfil(perfilSalvo);

          if (!perfilSalvo.enderecoDetalhado) {
            setCadastroCasaAberto(true);
          }
        }
      } catch (error) {
        console.error(
          'Erro ao carregar perfil:',
          error
        );

        if (ativo) {
          setErroPerfil(
            'Não foi possível carregar seus dados.'
          );
        }
      }
    }

    carregarPerfil();

    return () => {
      ativo = false;
    };
  }, [usuario?.uid]);

  async function salvarPerfil(dados) {
    const salvos = await atualizarPerfil(
      usuario.uid,
      dados
    );

    setDadosPerfil((atual) => ({
      ...atual,
      ...salvos,
    }));

    if (onPerfilAtualizado) {
      onPerfilAtualizado(salvos);
    }

    return salvos;
  }

  // Casa salva (Meus lugares ou Editar informações): o endereço do
  // perfil foi gravado junto (lugares.salvarLugar).
  function aplicarCasa({ endereco, enderecoDetalhado }) {
    setDadosPerfil((atual) => ({
      ...atual,
      endereco,
      enderecoDetalhado,
    }));
  }

  // Cadastro obrigatório da casa (o EditarLugar mostra o erro se falhar).
  async function salvarCasaObrigatoria(lugar) {
    const salvo = await salvarLugar(usuario.uid, 'casa', lugar);

    aplicarCasa(salvo);
    setCadastroCasaAberto(false);
    Alert.alert('Endereço salvo', 'Sua casa também foi marcada no mapa.');
  }

  /*
   * A foto vira uma miniatura (fotoPerfil.gerarMiniatura) e é salva em
   * usuarios/{uid}.foto: aparece em qualquer aparelho e para a família.
   */
  async function salvarFoto(uri) {
    try {
      setSalvandoFoto(true);

      const foto = await gerarMiniatura(uri);

      await salvarFotoPerfil(usuario.uid, foto);

      setDadosPerfil((atual) => ({ ...atual, foto }));
    } catch (error) {
      console.log(
        'Foto não salva:',
        error.code || error.message
      );

      Alert.alert(
        'Erro',
        'Não foi possível salvar a foto. Tente novamente.'
      );
    } finally {
      setSalvandoFoto(false);
    }
  }

  function escolherFoto() {
    Alert.alert(
      'Alterar foto de perfil',
      'Como você quer escolher a foto?',
      [
        {
          text: 'Tirar foto',
          onPress: () =>
            setAbrirCamera(true),
        },
        {
          text: 'Escolher da galeria',
          onPress:
            escolherDaGaleria,
        },
        {
          text: 'Cancelar',
          style: 'cancel',
        },
      ]
    );
  }

  async function escolherDaGaleria() {
    try {
      const permissao =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissao.granted) {
        Alert.alert(
          'Permissão necessária',
          'É necessário permitir o acesso às fotos.'
        );

        return;
      }

      const resultado =
        await ImagePicker.launchImageLibraryAsync(
          {
            mediaTypes:
              ImagePicker.MediaTypeOptions
                .Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          }
        );

      if (
        !resultado.canceled &&
        resultado.assets?.[0]?.uri
      ) {
        await salvarFoto(
          resultado.assets[0].uri
        );
      }
    } catch (error) {
      console.error(
        'Erro ao escolher da galeria:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível abrir a galeria.'
      );
    }
  }

  async function sairDoAplicativo() {
    try {
      await signOut(auth);

      console.log(
        'Usuário saiu da conta.'
      );

      if (onSair) {
        onSair();
      }
    } catch (error) {
      console.error(
        'Erro ao sair da conta:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível sair da conta. Tente novamente.'
      );
    }
  }

  function receberFoto(uri) {
    salvarFoto(uri);
    setAbrirCamera(false);
  }

  function cancelarCamera() {
    setAbrirCamera(false);
  }

  if (abrirCamera) {
    return (
      <CameraScreen
        onPhotoTaken={receberFoto}
        onCancel={cancelarCamera}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: espacoTopo },
        ]}
      >
        <Text style={styles.title}>
          Meu Perfil
        </Text>

        {semEndereco && (
          <TouchableOpacity
            style={styles.avisoEndereco}
            onPress={() => setCadastroCasaAberto(true)}
            accessibilityRole="button"
          >
            <Feather name="alert-circle" size={20} color={cores.erro} />

            <View style={styles.avisoEnderecoTextos}>
              <Text style={styles.avisoEnderecoTitulo}>
                Endereço obrigatório
              </Text>
              <Text style={styles.avisoEnderecoTexto}>
                Toque aqui para cadastrar o endereço da sua casa.
              </Text>
            </View>

            <Feather name="chevron-right" size={20} color={cores.textoSecundario} />
          </TouchableOpacity>
        )}

        {dadosPerfil ? (
          <DadosUsuario
            perfil={dadosPerfil}
            salvandoFoto={salvandoFoto}
            onAlterarFoto={
              escolherFoto
            }
          />
        ) : (
          <View
            style={
              styles.carregandoPerfil
            }
          >
            {erroPerfil ? (
              <Text
                style={
                  styles.erroPerfil
                }
              >
                {erroPerfil}
              </Text>
            ) : (
              <>
                <ActivityIndicator
                  color={cores.primaria}
                />

                <Text
                  style={
                    styles.carregandoTexto
                  }
                >
                  Carregando seus dados...
                </Text>
              </>
            )}
          </View>
        )}

        <View
          style={styles.rodape}
        >
          <Configuracoes
            usuario={usuario}
            perfil={dadosPerfil}
            onSalvarPerfil={salvarPerfil}
            onCasaSalva={aplicarCasa}
            posicaoAtual={posicaoAtual}
            grupoId={grupoId}
            onSair={
              sairDoAplicativo
            }
            onContaExcluida={onContaExcluida}
          />
        </View>
      </ScrollView>

      {cadastroCasaAberto && (
        <EditarLugar
          tipo={TIPO_CASA}
          lugar={null}
          posicaoAtual={posicaoAtual}
          onFechar={() => setCadastroCasaAberto(false)}
          onSalvar={salvarCasaObrigatoria}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },

  conteudo: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  carregandoPerfil: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },

  carregandoTexto: {
    fontSize: 15,
    color: cores.textoSecundario,
  },

  erroPerfil: {
    fontSize: 15,
    color: cores.erro,
    textAlign: 'center',
  },

  title: {
    fontSize: 26,
    fontFamily: fontes.titulo,
    color: cores.texto,
    marginBottom: 30,
  },

  rodape: {
    marginTop: 12,
    width: '100%',
  },

  avisoEndereco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 20,
    borderRadius: raio.card,
    borderWidth: 1.5,
    borderColor: cores.erro,
    backgroundColor: cores.superficie,
  },

  avisoEnderecoTextos: {
    flex: 1,
  },

  avisoEnderecoTitulo: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.erro,
  },

  avisoEnderecoTexto: {
    fontSize: 13,
    color: cores.texto,
    marginTop: 2,
  },
});