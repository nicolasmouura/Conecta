/*
 * Testes da miniatura da foto de perfil (fotoPerfil.js).
 */

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn() },
}));

const { ImageManipulator } = require('expo-image-manipulator');
const {
  LIMITE_FOTO,
  TENTATIVAS_MINIATURA,
  calcularRecorteQuadrado,
  gerarMiniatura,
} = require('./fotoPerfil');

/*
 * Manipulador falso: a imagem original tem largura x altura e cada
 * tentativa devolve um base64 do tamanho da lista tamanhos (na ordem).
 */
function simularImagem({ largura, altura, tamanhos }) {
  const salvar = jest.fn();
  tamanhos.forEach((tamanho) => salvar.mockResolvedValueOnce({ base64: 'a'.repeat(tamanho) }));

  const contexto = {
    crop: jest.fn(() => contexto),
    resize: jest.fn(() => contexto),
    renderAsync: jest.fn(() => Promise.resolve({ width: largura, height: altura, saveAsync: salvar })),
  };

  ImageManipulator.manipulate.mockReturnValue(contexto);

  return { contexto, salvar };
}

const CABECALHO = 'data:image/jpeg;base64,'.length;

describe('calcularRecorteQuadrado', () => {
  it('recorta o centro de uma foto deitada', () => {
    expect(calcularRecorteQuadrado(400, 300)).toEqual({ originX: 50, originY: 0, width: 300, height: 300 });
  });

  it('recorta o centro de uma foto em pé', () => {
    expect(calcularRecorteQuadrado(300, 501)).toEqual({ originX: 0, originY: 100, width: 300, height: 300 });
  });

  it('mantém uma foto já quadrada', () => {
    expect(calcularRecorteQuadrado(200, 200)).toEqual({ originX: 0, originY: 0, width: 200, height: 200 });
  });
});

describe('gerarMiniatura', () => {
  it('usa a primeira tentativa quando ela cabe no limite', async () => {
    const { contexto, salvar } = simularImagem({ largura: 800, altura: 600, tamanhos: [1000] });

    const foto = await gerarMiniatura('file://foto.jpg');

    expect(foto).toBe(`data:image/jpeg;base64,${'a'.repeat(1000)}`);
    expect(contexto.crop).toHaveBeenCalledWith({ originX: 100, originY: 0, width: 600, height: 600 });
    expect(contexto.resize).toHaveBeenCalledWith({ width: 300, height: 300 });
    expect(salvar).toHaveBeenCalledWith({ base64: true, compress: 0.6, format: 'jpeg' });
  });

  it('diminui a foto até caber', async () => {
    const grande = LIMITE_FOTO;
    const { contexto, salvar } = simularImagem({ largura: 500, altura: 500, tamanhos: [grande, grande, 500] });

    const foto = await gerarMiniatura('file://foto.jpg');

    expect(foto.length).toBe(CABECALHO + 500);
    expect(salvar).toHaveBeenCalledTimes(3);
    expect(contexto.resize).toHaveBeenLastCalledWith({ width: 180, height: 180 });
  });

  it('aceita a foto exatamente no limite', async () => {
    simularImagem({ largura: 10, altura: 10, tamanhos: [LIMITE_FOTO - CABECALHO] });

    expect((await gerarMiniatura('x')).length).toBe(LIMITE_FOTO);
  });

  it('falha quando nem a menor tentativa cabe', async () => {
    simularImagem({ largura: 10, altura: 10, tamanhos: TENTATIVAS_MINIATURA.map(() => LIMITE_FOTO) });

    await expect(gerarMiniatura('x')).rejects.toThrow('FOTO_GRANDE_DEMAIS');
  });
});
