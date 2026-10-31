/*
 * Testes da tela Meu Perfil (PerfilScreen.js), com o Firestore falso.
 * Câmera, formulário da casa e Configurações são simulados (têm testes
 * próprios); a miniatura da foto e a galeria também.
 */

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import PerfilScreen from './PerfilScreen';
import { gerarMiniatura } from '../dados/fotoPerfil';

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('../dados/fotoPerfil', () => ({ gerarMiniatura: jest.fn() }));

jest.mock('../camera/CameraScreen', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return function CameraFalsa({ onPhotoTaken, onCancel }) {
    return (
      <View>
        <TouchableOpacity onPress={() => onPhotoTaken('file://camera.jpg')}>
          <Text>Foto da câmera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text>Fechar câmera</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

jest.mock('../lugares/EditarLugar', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return function EditarLugarFalso({ onSalvar, onFechar }) {
    return (
      <View>
        <Text>Cadastro da casa</Text>
        <TouchableOpacity
          onPress={() =>
            onSalvar({
              enderecoDetalhado: {
                pais: 'Brasil',
                estado: 'SP',
                cidade: 'São Paulo',
                bairro: 'Centro',
                rua: 'Rua A',
                numero: '10',
                cep: '01001-000',
              },
              latitude: 1,
              longitude: 2,
            })
          }
        >
          <Text>Salvar casa</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onFechar}>
          <Text>Fechar casa</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

jest.mock('./Configuracoes', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return function ConfiguracoesFalsa({ onSair, onSalvarPerfil }) {
    return (
      <View>
        <TouchableOpacity onPress={onSair}>
          <Text>Sair (configurações)</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSalvarPerfil({ nome: 'Ana Lima', telefone: '1133334444' })}>
          <Text>Salvar perfil (configurações)</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

const firestore = require('firebase/firestore');
const authFirebase = require('firebase/auth');
const config = require('../config/firebase');
const { apagarDadosLocais } = require('../dados/armazenamentoLocal');

const USUARIO = { uid: 'u1', nome: 'Ana' };
const ENDERECO = { rua: 'Rua A' };

beforeEach(async () => {
  firestore.__limpar();
  await apagarDadosLocais();
  config.auth.currentUser = { uid: 'u1', email: 'ana@exemplo.com' };
  firestore.__semear('usuarios/u1', { nome: 'Ana', email: 'ana@exemplo.com', endereco: 'Rua A, 10', enderecoDetalhado: ENDERECO });

  gerarMiniatura.mockResolvedValue('data:miniatura');
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://galeria.jpg' }] });
  authFirebase.signOut.mockResolvedValue();

  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(props = {}) {
  await render(<PerfilScreen usuario={USUARIO} {...props} />);
  await act(() => esperar());
}

// Escolhe uma opção do Alert "Alterar foto de perfil".
async function escolherOpcaoDaFoto(texto) {
  await fireEvent.press(screen.getByText('Adicionar foto'));
  const botoes = Alert.alert.mock.calls.at(-1)[2];
  await act(async () => {
    await botoes.find((botao) => botao.text === texto).onPress();
    await esperar();
  });
}

describe('PerfilScreen', () => {
  it('carrega e mostra os dados', async () => {
    await abrir();

    expect(screen.getByText('Meu Perfil')).toBeOnTheScreen();
    expect(screen.getByText('ana@exemplo.com')).toBeOnTheScreen();
    expect(screen.queryByText('Endereço obrigatório')).toBeNull();
  });

  it('erro ao carregar', async () => {
    firestore.__falhar('getDoc', { code: 'permission-denied' });

    await abrir();

    expect(screen.getByText('Não foi possível carregar seus dados.')).toBeOnTheScreen();
  });

  it('sem endereço: abre o cadastro da casa e avisa o App', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana' });
    const onEnderecoPendente = jest.fn();

    await abrir({ onEnderecoPendente });

    expect(screen.getByText('Cadastro da casa')).toBeOnTheScreen();
    expect(onEnderecoPendente).toHaveBeenLastCalledWith(true);

    await fireEvent.press(screen.getByText('Fechar casa'));
    expect(screen.getByText('Endereço obrigatório')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Endereço obrigatório'));
    await fireEvent.press(screen.getByText('Salvar casa'));

    expect(Alert.alert).toHaveBeenCalledWith('Endereço salvo', 'Sua casa também foi marcada no mapa.');
    expect(screen.queryByText('Endereço obrigatório')).toBeNull();
    expect(onEnderecoPendente).toHaveBeenLastCalledWith(false);
    expect(firestore.__ler('usuarios/u1').enderecoDetalhado).toMatchObject({ rua: 'Rua A' });
  });

  it('o App pede o cadastro de novo (pedidoEndereco)', async () => {
    firestore.__semear('usuarios/u1', { nome: 'Ana' });
    await abrir({ pedidoEndereco: 0 });
    await fireEvent.press(screen.getByText('Fechar casa'));

    await screen.rerender(<PerfilScreen usuario={USUARIO} pedidoEndereco={1} />);

    expect(screen.getByText('Cadastro da casa')).toBeOnTheScreen();
  });

  it('foto da galeria vira miniatura e é salva no perfil', async () => {
    await abrir();

    await escolherOpcaoDaFoto('Escolher da galeria');

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [1, 1] })
    );
    expect(gerarMiniatura).toHaveBeenCalledWith('file://galeria.jpg');
    expect(firestore.__ler('usuarios/u1').foto).toBe('data:miniatura');
    expect(screen.getByText('Alterar foto')).toBeOnTheScreen();
  });

  it('galeria sem permissão', async () => {
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    await abrir();

    await escolherOpcaoDaFoto('Escolher da galeria');

    expect(Alert.alert).toHaveBeenLastCalledWith('Permissão necessária', 'É necessário permitir o acesso às fotos.');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('galeria cancelada não salva nada', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
    await abrir();

    await escolherOpcaoDaFoto('Escolher da galeria');

    expect(gerarMiniatura).not.toHaveBeenCalled();
  });

  it('erro ao abrir a galeria', async () => {
    ImagePicker.launchImageLibraryAsync.mockRejectedValue(new Error('falhou'));
    await abrir();

    await escolherOpcaoDaFoto('Escolher da galeria');

    expect(Alert.alert).toHaveBeenLastCalledWith('Erro', 'Não foi possível abrir a galeria.');
  });

  it('foto grande demais: avisa', async () => {
    gerarMiniatura.mockRejectedValue(new Error('FOTO_GRANDE_DEMAIS'));
    await abrir();

    await escolherOpcaoDaFoto('Escolher da galeria');

    expect(Alert.alert).toHaveBeenLastCalledWith('Erro', 'Não foi possível salvar a foto. Tente novamente.');
  });

  it('câmera: esconde o menu, tira a foto e volta ao perfil', async () => {
    const onTelaCheia = jest.fn();
    await abrir({ onTelaCheia });

    await escolherOpcaoDaFoto('Tirar foto');
    expect(onTelaCheia).toHaveBeenLastCalledWith(true);

    await fireEvent.press(screen.getByText('Foto da câmera'));
    await act(() => esperar());

    expect(onTelaCheia).toHaveBeenLastCalledWith(false);
    expect(gerarMiniatura).toHaveBeenCalledWith('file://camera.jpg');
    expect(screen.getByText('Meu Perfil')).toBeOnTheScreen();
  });

  it('fechar a câmera volta sem salvar', async () => {
    await abrir();

    await escolherOpcaoDaFoto('Tirar foto');
    await fireEvent.press(screen.getByText('Fechar câmera'));

    expect(screen.getByText('Meu Perfil')).toBeOnTheScreen();
    expect(gerarMiniatura).not.toHaveBeenCalled();
  });

  it('salvar o perfil atualiza a tela e avisa o App', async () => {
    const onPerfilAtualizado = jest.fn();
    await abrir({ onPerfilAtualizado });

    await fireEvent.press(screen.getByText('Salvar perfil (configurações)'));

    expect(onPerfilAtualizado).toHaveBeenCalledWith({ nome: 'Ana Lima', telefone: '(11) 3333-4444' });
    expect(screen.getByText('Ana Lima')).toBeOnTheScreen();
  });

  it('sair encerra a sessão do Firebase', async () => {
    const onSair = jest.fn();
    await abrir({ onSair });

    await fireEvent.press(screen.getByText('Sair (configurações)'));

    expect(authFirebase.signOut).toHaveBeenCalledWith(config.auth);
    expect(onSair).toHaveBeenCalled();
  });

  it('erro ao sair', async () => {
    authFirebase.signOut.mockRejectedValue(new Error('falhou'));
    const onSair = jest.fn();
    await abrir({ onSair });

    await fireEvent.press(screen.getByText('Sair (configurações)'));

    expect(Alert.alert).toHaveBeenCalledWith('Erro', 'Não foi possível sair da conta. Tente novamente.');
    expect(onSair).not.toHaveBeenCalled();
  });
});
