/*
 * Transforma a foto escolhida numa miniatura JPEG pequena (base64) que
 * cabe no perfil do Firestore.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/*
 * Miniatura da foto de perfil, guardada em usuarios/{uid}.foto como
 * "data:image/jpeg;base64,...". Tentativas do maior para o menor até
 * caber com folga no limite conferido pelo firestore.rules.
 */
export const LIMITE_FOTO = 90000; // caracteres (regras aceitam até 100.000)

export const TENTATIVAS_MINIATURA = [
  { lado: 300, qualidade: 0.6 },
  { lado: 240, qualidade: 0.5 },
  { lado: 180, qualidade: 0.45 },
];

// Maior quadrado central da imagem.
export function calcularRecorteQuadrado(largura, altura) {
  const lado = Math.min(largura, altura);

  return {
    originX: Math.floor((largura - lado) / 2),
    originY: Math.floor((altura - lado) / 2),
    width: lado,
    height: lado,
  };
}

export async function gerarMiniatura(uri) {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const recorte = calcularRecorteQuadrado(original.width, original.height);

  for (const { lado, qualidade } of TENTATIVAS_MINIATURA) {
    const imagem = await ImageManipulator.manipulate(uri)
      .crop(recorte)
      .resize({ width: lado, height: lado })
      .renderAsync();

    const resultado = await imagem.saveAsync({
      base64: true,
      compress: qualidade,
      format: SaveFormat.JPEG,
    });

    const foto = `data:image/jpeg;base64,${resultado.base64}`;

    if (foto.length <= LIMITE_FOTO) {
      return foto;
    }
  }

  throw new Error('FOTO_GRANDE_DEMAIS');
}
