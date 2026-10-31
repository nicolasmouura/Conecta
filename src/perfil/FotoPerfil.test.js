/*
 * Testes da foto de perfil redonda (FotoPerfil.js).
 */

import { fireEvent, render } from '@testing-library/react-native';

import FotoPerfil from './FotoPerfil';

describe('FotoPerfil', () => {
  it('sem foto: círculo cinza do tamanho pedido', async () => {
    const { root } = await render(<FotoPerfil foto={null} tamanho={40} />);

    expect(root.type).toBe('View');
    expect(root).toHaveStyle({ width: 40, height: 40, borderRadius: 20, backgroundColor: '#C4CCD4' });
  });

  it('com foto: imagem redonda com borda', async () => {
    const { root } = await render(
      <FotoPerfil foto="data:image/jpeg;base64,abc" tamanho={60} larguraBorda={2} corBorda="#123456" />
    );

    expect(root.type).toBe('Image');
    expect(root.props.source).toEqual({ uri: 'data:image/jpeg;base64,abc' });
    expect(root).toHaveStyle({ width: 60, borderRadius: 30, borderWidth: 2, borderColor: '#123456' });
  });

  it('avisa quando a foto carrega', async () => {
    const onLoad = jest.fn();
    const { root } = await render(<FotoPerfil foto="data:x" onLoad={onLoad} />);

    await fireEvent(root, 'load');

    expect(onLoad).toHaveBeenCalled();
  });

  it('usa 48 de tamanho padrão', async () => {
    const { root } = await render(<FotoPerfil />);

    expect(root).toHaveStyle({ width: 48, height: 48 });
  });
});
