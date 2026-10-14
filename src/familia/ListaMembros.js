/*
 * Lista dos membros da família (e dos convites pendentes), um
 * MembroCard por pessoa.
 */

import { FlatList, StyleSheet } from 'react-native';
import MembroCard from './MembroCard';

export default function ListaMembros({ membros, uidAtual }) {
  return (
    <FlatList
      data={membros}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <MembroCard
          nome={item.perfil?.nome || item.nome}
          status={item.status}
          papel={item.papel}
          perfil={item.perfil}
          voce={item.uid === uidAtual}
        />
      )}
      style={styles.lista}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={true}
    />
  );
}

const styles = StyleSheet.create({
  lista: {
    width: '100%',
    flex: 1,
  },

  // Margem lateral em vez de centralizar: centralizado, cada card
  // cresce até o tamanho do texto mais longo (ex.: endereço) e passa
  // da tela. Assim o card fica com 90% da largura, como os botões.
  container: {
    paddingHorizontal: '5%',
    paddingBottom: 20,
  },
});
