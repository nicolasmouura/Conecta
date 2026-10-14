/*
 * Foto de perfil redonda (ou círculo cinza, sem foto), usada no
 * perfil, nos cards e no mapa.
 */

import { Image, StyleSheet, View } from 'react-native';
import { cores } from '../theme/theme';

// Cinza neutro para quem não tem foto (sem letra, sem ícone).
const CINZA_SEM_FOTO = '#C4CCD4';

/*
 * Foto de perfil circular, usada no Perfil, nos cards e no marcador
 * do mapa. Sem foto: apenas um círculo cinza.
 *
 * foto: "data:image/jpeg;base64,..." (usuarios/{uid}.foto) ou null
 */
export default function FotoPerfil({ foto, tamanho = 48, corBorda = cores.superficie, larguraBorda = 0, onLoad }) {
  const estilo = {
    width: tamanho,
    height: tamanho,
    borderRadius: tamanho / 2,
    borderWidth: larguraBorda,
    borderColor: corBorda,
  };

  if (!foto) {
    return <View style={[styles.base, styles.semFoto, estilo]} />;
  }

  return (
    <Image
      source={{ uri: foto }}
      style={[styles.base, estilo]}
      onLoad={onLoad}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: CINZA_SEM_FOTO,
  },

  semFoto: {
    backgroundColor: CINZA_SEM_FOTO,
  },
});
