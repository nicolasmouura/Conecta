/*
 * Card de um membro em Minha Família: nome, papel, situação e contato
 * (telefone e onde mora). O CPF nunca aparece para a família.
 */

import { StyleSheet, Text, View } from 'react-native';
import { cores, fontes, raio, sombra } from '../theme/theme';

const STATUS = {
  ativo: { texto: 'Membro ativo', cor: cores.online },
  pendente: { texto: 'Convite pendente', cor: cores.pendente },
};

const PAPEIS = {
  administrador: 'Administrador',
  membro: 'Membro',
};

function Informacao({ label, valor }) {
  return (
    <Text style={styles.informacao}>
      <Text style={styles.informacaoLabel}>{label}: </Text>
      {valor || 'Não informado'}
    </Text>
  );
}

export default function MembroCard({ nome, status, papel, perfil, voce }) {
  const infoStatus = STATUS[status] || STATUS.pendente;

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <View style={styles.nomeLinha}>
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
            {voce ? ' (você)' : ''}
          </Text>

          {PAPEIS[papel] && (
            <Text
              style={[
                styles.papel,
                papel === 'administrador' && styles.papelAdministrador,
              ]}
            >
              {PAPEIS[papel]}
            </Text>
          )}
        </View>

        <View style={styles.statusLinha}>
          <View
            style={[styles.bolinha, { backgroundColor: infoStatus.cor }]}
          />

          <Text style={styles.statusTexto}>{infoStatus.texto}</Text>
        </View>

        {status === 'ativo' && (
          <View style={styles.dados}>
            <Informacao label="Telefone" valor={perfil?.telefone} />

            <Informacao label="Onde mora" valor={perfil?.endereco} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginVertical: 6,
    borderRadius: raio.card,
    backgroundColor: cores.superficie,
    ...sombra,
  },

  info: {
    gap: 6,
  },

  nomeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  nome: {
    flexShrink: 1,
    fontSize: 17,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  papel: {
    fontSize: 12,
    fontFamily: fontes.destaque,
    color: cores.textoSecundario,
    backgroundColor: cores.fundo,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: raio.pilula,
    overflow: 'hidden',
  },

  papelAdministrador: {
    color: cores.primaria,
    backgroundColor: cores.superficieAlternativa,
  },

  statusLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  bolinha: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  statusTexto: {
    fontSize: 14,
    color: cores.textoSecundario,
  },

  dados: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    gap: 3,
  },

  informacao: {
    fontSize: 14,
    color: cores.texto,
  },

  informacaoLabel: {
    color: cores.textoSecundario,
  },
});
