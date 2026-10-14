/*
 * Configurações → Meus lugares: lista dos lugares (por enquanto, a
 * Casa) e abre o cadastro ou a edição.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import EditarLugar from './EditarLugar';
import BotaoVoltar from '../navegacao/BotaoVoltar';
import { buscarLugares, salvarLugar, TIPOS_LUGAR } from '../dados/lugares';
import { cores, fontes, raio } from '../theme/theme';

// Configurações → Meus lugares. Nesta etapa: Casa (obrigatória).
// Salvar a Casa também muda o endereço do perfil (onCasaSalva).
export default function MeusLugares({ usuario, posicaoAtual, onCasaSalva, onVoltar }) {
  const [lugares, setLugares] = useState(null);
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;

    buscarLugares(usuario.uid)
      .then((resultado) => ativo && setLugares(resultado))
      .catch((e) => {
        console.log('Lugares indisponíveis:', e.code || e.message);
        if (ativo) setErro('Não foi possível carregar seus lugares.');
      });

    return () => {
      ativo = false;
    };
  }, [usuario.uid]);

  async function salvar(dados) {
    const salvo = await salvarLugar(usuario.uid, editando.id, dados);

    setLugares((atuais) => ({ ...atuais, [editando.id]: salvo }));
    if (editando.id === 'casa') onCasaSalva?.(salvo);
    setEditando(null);
    Alert.alert('Lugar salvo', `${editando.nome} atualizada com sucesso.`);
  }

  return (
    <View style={styles.container}>
      <BotaoVoltar label="Configurações" onPress={onVoltar} />

      <Text style={styles.titulo}>Meus lugares</Text>
      <Text style={styles.subtitulo}>
        A posição dos seus lugares é privada: a família vê apenas se você
        está em casa ou a distância aproximada até ela. O endereço da casa é
        o mesmo do seu perfil.
      </Text>

      {lugares === null && !erro && <ActivityIndicator color={cores.primaria} />}
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      {lugares !== null &&
        TIPOS_LUGAR.map((tipo) => {
          const lugar = lugares[tipo.id];

          // Salvo antes dos campos separados: a posição pode ser a
          // de onde a pessoa estava, não a do endereço.
          const incompleto = Boolean(lugar) && !lugar.enderecoDetalhado;

          let descricao = lugar?.endereco;
          if (!lugar && tipo.obrigatorio) descricao = 'Não cadastrada · obrigatória';
          if (!lugar && tipo.emBreve) descricao = 'Em breve';
          if (incompleto) descricao = 'Endereço incompleto · toque em Editar para atualizar';

          return (
            <View key={tipo.id} style={[styles.item, tipo.emBreve && styles.itemEmBreve]}>
              <View style={styles.icone}>
                <Feather name={tipo.icone} size={18} color={cores.primaria} />
              </View>

              <View style={styles.itemTextos}>
                <Text style={styles.itemNome}>{tipo.nome}</Text>
                <Text
                  style={[
                    styles.itemDescricao,
                    ((!lugar && tipo.obrigatorio) || incompleto) && styles.pendente,
                  ]}
                  numberOfLines={2}
                >
                  {descricao}
                </Text>
              </View>

              {!tipo.emBreve && (
                <TouchableOpacity style={styles.botao} onPress={() => setEditando(tipo)}>
                  <Text style={styles.botaoTexto}>{lugar ? 'Editar' : 'Cadastrar'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

      {editando && (
        <EditarLugar
          tipo={editando}
          lugar={lugares?.[editando.id] || null}
          posicaoAtual={posicaoAtual}
          onFechar={() => setEditando(null)}
          onSalvar={salvar}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '90%',
    marginTop: 30,
  },

  titulo: {
    fontSize: 20,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  subtitulo: {
    fontSize: 13,
    lineHeight: 19,
    color: cores.textoSecundario,
    marginTop: 4,
    marginBottom: 16,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },

  itemEmBreve: {
    opacity: 0.55,
  },

  icone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.superficieAlternativa,
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemTextos: {
    flex: 1,
  },

  itemNome: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.texto,
  },

  itemDescricao: {
    fontSize: 13,
    color: cores.textoSecundario,
  },

  pendente: {
    color: cores.pendente,
  },

  botao: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 13,
    fontFamily: fontes.destaque,
  },
});
