import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';

import { signOut } from '../armazenamento/contasLocais';

import DadosUsuario from './DadosUsuario';
import Configuracoes from './Configuracoes';
import CameraScreen from '../camera/CameraScreen';

import { auth } from '../config/armazenamento';
import {
  atualizarPerfil,
  buscarPerfil,
  salvarFotoPerfil,
} from '../dados/salvarUsuario';
import { gerarMiniatura } from '../dados/fotoPerfil';
import {
  cores,
  fontes,
} from '../theme/theme';

export default function PerfilScreen({
  usuario,
  onSair,
  onPerfilAtualizado,
  posicaoAtual,
  grupoId,
  onTelaCheia,
}) {
  const [abrirCamera, setAbrirCamera] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);

  // Dados pessoais vindos de usuarios/{uid}
  const [dadosPerfil, setDadosPerfil] = useState(null);
  const [erroPerfil, setErroPerfil] = useState('');

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
        contentContainerStyle={
          styles.conteudo
        }
      >
        <Text style={styles.title}>
          Meu Perfil
        </Text>

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
          />
        </View>
      </ScrollView>
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
});