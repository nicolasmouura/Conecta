/*
 * Testes dos botões da câmera (CameraControls.js).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import CameraControls from './CameraControls';

function botoes() {
  // Imagens dos botões: virar a câmera, depois tirar a foto.
  return screen.container.queryAll((no) => no.type === 'Image');
}

describe('CameraControls', () => {
  it('vira a câmera e tira a foto', async () => {
    const onFlip = jest.fn();
    const onCapture = jest.fn();

    await render(<CameraControls onFlip={onFlip} onCapture={onCapture} isSaving={false} />);
    const [virar, capturar] = botoes();

    await fireEvent.press(virar);
    await fireEvent.press(capturar);

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Salvando foto...')).toBeNull();
  });

  it('salvando: avisa e trava os botões', async () => {
    const onFlip = jest.fn();
    const onCapture = jest.fn();

    await render(<CameraControls onFlip={onFlip} onCapture={onCapture} isSaving />);
    const [virar, capturar] = botoes();

    expect(screen.getByText('Salvando foto...')).toBeOnTheScreen();
    expect(virar).toBeDisabled();
    expect(capturar).toBeDisabled();
    await fireEvent.press(capturar);
    expect(onCapture).not.toHaveBeenCalled();
  });
});
