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

  container: {
    alignItems: 'center',
    paddingBottom: 20,
  },
});
