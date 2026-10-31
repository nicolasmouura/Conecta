/*
 * Testes da câmera da foto de perfil (CameraScreen.js).
 */

import { Alert, BackHandler } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import CameraScreen from './CameraScreen';

const mockTirarFoto = jest.fn();

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    useCameraPermissions: jest.fn(),
    CameraView: React.forwardRef(function CameraView(props, ref) {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTirarFoto }));
      return React.createElement(View, { testID: 'camera', ...props });
    }),
  };
});

const { useCameraPermissions } = require('expo-camera');

let pedirPermissao;
let voltarAndroid;

beforeEach(() => {
  pedirPermissao = jest.fn();
  useCameraPermissions.mockReturnValue([{ granted: true }, pedirPermissao]);
  mockTirarFoto.mockResolvedValue({ uri: 'file://foto.jpg' });

  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, ouvinte) => {
    voltarAndroid = ouvinte;
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Imagens dos botões da barra de controles: [virar, capturar].
function controles() {
  return screen.container.queryAll((no) => no.type === 'Image');
}

describe('CameraScreen', () => {
  it('enquanto a permissão carrega', async () => {
    useCameraPermissions.mockReturnValue([null, pedirPermissao]);

    await render(<CameraScreen />);

    expect(screen.getByText('Verificando permissão da câmera...')).toBeOnTheScreen();
  });

  it('sem permissão: pede e avisa se for negada', async () => {
    useCameraPermissions.mockReturnValue([{ granted: false }, pedirPermissao]);
    pedirPermissao.mockResolvedValue({ granted: false });

    await render(<CameraScreen onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByText('Permitir câmera'));

    expect(pedirPermissao).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Permissão necessária', expect.any(String));
  });

  it('erro ao pedir permissão', async () => {
    useCameraPermissions.mockReturnValue([{ granted: false }, pedirPermissao]);
    pedirPermissao.mockRejectedValue(new Error('falhou'));

    await render(<CameraScreen />);
    await fireEvent.press(screen.getByText('Permitir câmera'));

    expect(Alert.alert).toHaveBeenCalledWith('Erro', 'Não foi possível solicitar a permissão da câmera.');
  });

  it('sem permissão, cancelar fecha', async () => {
    useCameraPermissions.mockReturnValue([{ granted: false }, pedirPermissao]);
    const onCancel = jest.fn();

    await render(<CameraScreen onCancel={onCancel} />);
    await fireEvent.press(screen.getByText('Cancelar'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('tira a foto, mostra a prévia e entrega ao confirmar', async () => {
    const onPhotoTaken = jest.fn();

    await render(<CameraScreen onPhotoTaken={onPhotoTaken} />);
    await fireEvent.press(controles()[1]);

    expect(mockTirarFoto).toHaveBeenCalledWith({ quality: 0.8, skipProcessing: true });
    await fireEvent.press(await screen.findByText('Usar foto'));

    expect(onPhotoTaken).toHaveBeenCalledWith('file://foto.jpg');
  });

  it('tirar novamente fecha a prévia sem entregar', async () => {
    const onPhotoTaken = jest.fn();

    await render(<CameraScreen onPhotoTaken={onPhotoTaken} />);
    await fireEvent.press(controles()[1]);
    await fireEvent.press(await screen.findByText('Tirar novamente'));

    expect(screen.queryByText('Usar foto')).toBeNull();
    expect(onPhotoTaken).not.toHaveBeenCalled();
  });

  it('vira a câmera', async () => {
    await render(<CameraScreen />);

    expect(screen.getByTestId('camera')).toHaveProp('facing', 'back');
    await fireEvent.press(controles()[0]);
    expect(screen.getByTestId('camera')).toHaveProp('facing', 'front');
  });

  it('avisa quando a foto falha', async () => {
    mockTirarFoto.mockResolvedValue({});

    await render(<CameraScreen />);
    await fireEvent.press(controles()[1]);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erro', 'Não foi possível tirar a foto.'));
    expect(screen.queryByText('Usar foto')).toBeNull();
  });

  it('o "x" e o voltar do Android fecham a câmera', async () => {
    const onCancel = jest.fn();

    await render(<CameraScreen onCancel={onCancel} />);
    await fireEvent.press(screen.getByTestId('icone-x'));
    voltarAndroid();

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('sem onCancel, não há "x"', async () => {
    await render(<CameraScreen />);

    expect(screen.queryByTestId('icone-x')).toBeNull();
  });
});
