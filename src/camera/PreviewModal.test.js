/*
 * Testes da pré-visualização da foto (PreviewModal.js).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import PreviewModal from './PreviewModal';

function abrir(props = {}) {
  const funcoes = { onClose: jest.fn(), onConfirm: jest.fn(), onRetake: jest.fn() };

  return render(<PreviewModal visible imageUri="file://foto.jpg" {...funcoes} {...props} />).then(() => funcoes);
}

describe('PreviewModal', () => {
  it('mostra a foto tirada', async () => {
    await abrir();

    expect(screen.getByText('Pré-visualização')).toBeOnTheScreen();
    expect(screen.container.queryAll((no) => no.props.source?.uri === 'file://foto.jpg')).toHaveLength(1);
  });

  it('"Usar foto" confirma', async () => {
    const { onConfirm, onRetake } = await abrir();

    await fireEvent.press(screen.getByText('Usar foto'));

    expect(onConfirm).toHaveBeenCalled();
    expect(onRetake).not.toHaveBeenCalled();
  });

  it('"Tirar novamente" volta para a câmera', async () => {
    const { onRetake } = await abrir();

    await fireEvent.press(screen.getByText('Tirar novamente'));

    expect(onRetake).toHaveBeenCalled();
  });

  it('o voltar do Android fecha', async () => {
    const { onClose } = await abrir();

    await fireEvent(screen.container.queryAll((no) => no.props.onRequestClose)[0], 'requestClose');

    expect(onClose).toHaveBeenCalled();
  });

  it('sem foto, só os botões', async () => {
    await abrir({ imageUri: null });

    expect(screen.container.queryAll((no) => no.type === 'Image')).toHaveLength(0);
  });

  it('escondido não mostra nada', async () => {
    await abrir({ visible: false });

    expect(screen.queryByText('Usar foto')).toBeNull();
  });
});
