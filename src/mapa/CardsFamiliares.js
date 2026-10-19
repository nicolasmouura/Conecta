/*
 * Cards dos familiares abaixo do mapa (foto, online, bateria, rua,
 * casa, "Estou bem" e distância); tocar num card centraliza o mapa nele.
 */

import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import FotoPerfil from '../perfil/FotoPerfil';
import { cores, fontes, raio } from '../theme/theme';

function CardFamiliar({ card, selecionado, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.card, selecionado && styles.cardSelecionado]}
      onPress={onPress}
      disabled={!card.temLocalizacao}
      activeOpacity={0.8}
    >
      <FotoPerfil foto={card.foto} tamanho={48} />

      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>
          {card.nome}
          {card.voce ? ' (você)' : ''}
        </Text>

        <View style={styles.linha}>
          <View
            style={[
              styles.bolinha,
              { backgroundColor: card.online ? cores.online : cores.textoSecundario },
            ]}
          />
          <Text style={styles.status} numberOfLines={1}>
            {card.temLocalizacao ? `${card.online ? 'Online' : 'Offline'} · ${card.visto}` : card.visto}
          </Text>
        </View>

        {card.bateria && (
          <View style={styles.linha}>
            <Feather
              name={card.bateria.icone}
              size={12}
              color={card.bateria.baixa ? cores.erro : cores.textoSecundario}
            />
            <Text
              style={[styles.detalhe, card.bateria.baixa && styles.bateriaBaixa]}
              numberOfLines={1}
            >
              {card.bateria.texto}
            </Text>
          </View>
        )}

        {card.rua && (
          <View style={styles.linha}>
            <Feather name="map-pin" size={12} color={cores.textoSecundario} />
            <Text style={styles.detalhe} numberOfLines={1}>{card.rua}</Text>
          </View>
        )}

        {card.casa && (
          <View style={styles.linha}>
            <Feather name="home" size={12} color={cores.textoSecundario} />
            <Text style={styles.detalhe} numberOfLines={1}>{card.casa}</Text>
          </View>
        )}

        {card.estouBem && (
          <View style={styles.linha}>
            <Feather name="heart" size={12} color={cores.primaria} />
            <Text style={styles.estouBem} numberOfLines={1}>{card.estouBem}</Text>
          </View>
        )}

        {card.distancia && (
          <Text style={styles.distancia}>{card.distancia} de você</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Lista de familiares abaixo do mapa. Tocar em um card centraliza o mapa.
export default function CardsFamiliares({ cards, selecionado, onSelecionar }) {
  return (
    <View style={styles.painel}>
      <Text style={styles.titulo}>Minha Família</Text>

      <FlatList
        data={cards}
        keyExtractor={(card) => card.uid}
        renderItem={({ item }) => (
          <CardFamiliar
            card={item}
            selecionado={item.uid === selecionado}
            onPress={() => onSelecionar(item.uid)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.vazio}>Carregando familiares...</Text>
        }
        contentContainerStyle={styles.lista}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  painel: {
    height: '40%',
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -16,
    paddingTop: 16,
    paddingHorizontal: 16,
  },

  titulo: {
    fontSize: 18,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 10,
  },

  lista: {
    gap: 10,
    paddingBottom: 20,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: raio.card,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },

  cardSelecionado: {
    borderColor: cores.primaria,
    borderWidth: 2,
  },

  info: {
    flex: 1,
    gap: 2,
  },

  nome: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  bolinha: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  status: {
    flex: 1,
    fontSize: 13,
    color: cores.textoSecundario,
  },

  detalhe: {
    flex: 1,
    fontSize: 13,
    color: cores.texto,
  },

  bateriaBaixa: {
    color: cores.erro,
    fontFamily: fontes.destaque,
  },

  distancia: {
    fontSize: 13,
    color: cores.primaria,
    fontFamily: fontes.destaque,
  },

  estouBem: {
    flex: 1,
    fontSize: 13,
    color: cores.primaria,
  },

  vazio: {
    fontSize: 14,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: 10,
  },
});
