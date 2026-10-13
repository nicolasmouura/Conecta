import { useState } from 'react';

import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { criarGrupo } from '../dados/grupo';
import { useVoltarAndroid } from '../navegacao/voltar';
import { mensagemDeErro } from '../dados/convites';
import ConvitesRecebidos from '../familia/ConvitesRecebidos';
import { cores, fontes, raio } from '../theme/theme';

export default function GrupoScreen({
  usuario,
  onGrupoConcluido,
  onPular,
}) {
  const [criando, setCriando] = useState(false);

  const [nomeGrupo, setNomeGrupo] = useState('');

  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const [grupoCriado, setGrupoCriado] = useState(null);

  // Voltar do Android em "Criar família": igual ao botão "Voltar".
  useVoltarAndroid(criando && !grupoCriado, () => {
    if (carregando) return;
    setCriando(false);
    setErro('');
  });

  // =====================================================
  // GRUPO CRIADO
  // =====================================================

  if (grupoCriado) {
    return (
      <View style={styles.container}>

        <Text style={styles.titulo}>
          Família criada com sucesso.
        </Text>

        <Text style={styles.subtitulo}>
          {grupoCriado.nome}
        </Text>

        <Text style={styles.instrucao}>
          Agora você pode convidar sua família pela
          tela “Minha Família”, usando o e-mail de
          cada pessoa.
        </Text>

        <TouchableOpacity
          style={styles.botao}
          onPress={() =>
            onGrupoConcluido(grupoCriado.id)
          }
        >
          <Text style={styles.botaoTexto}>
            Continuar
          </Text>
        </TouchableOpacity>

      </View>
    );
  }

  // =====================================================
  // CRIAR GRUPO
  // =====================================================

  if (criando) {
    return (
      <View style={styles.container}>

        <Text style={styles.titulo}>
          Criar família
        </Text>

        <Text style={styles.subtitulo}>
          Escolha um nome para identificar sua família.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Ex: Família Silva"
          placeholderTextColor={cores.textoSecundario}
          value={nomeGrupo}
          onChangeText={(texto) => {
            setNomeGrupo(texto);
            setErro('');
          }}
          maxLength={60}
        />

        {erro ? (
          <Text style={styles.erro}>
            {erro}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[
            styles.botao,
            carregando && styles.botaoDesabilitado,
          ]}
          disabled={carregando}
          onPress={async () => {

            if (!nomeGrupo.trim()) {
              setErro(
                'Digite um nome para a família.'
              );
              return;
            }

            try {
              setErro('');
              setCarregando(true);

              const grupo =
                await criarGrupo(
                  nomeGrupo,
                  usuario
                );

              setGrupoCriado(grupo);

            } catch (e) {

              console.error(
                'Erro ao criar grupo:',
                e
              );

              setErro(
                mensagemDeErro(
                  e,
                  'Não foi possível criar a família.'
                )
              );

            } finally {
              setCarregando(false);
            }
          }}
        >
          <Text style={styles.botaoTexto}>
            {carregando
              ? 'Criando...'
              : 'Criar família'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botaoSecundario}
          disabled={carregando}
          onPress={() => {
            setCriando(false);
            setErro('');
          }}
        >
          <Text style={styles.botaoSecundarioTexto}>
            Voltar
          </Text>
        </TouchableOpacity>

      </View>
    );
  }

  // =====================================================
  // TELA PRINCIPAL
  // =====================================================

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >

      <Text style={styles.titulo}>
        Grupo Familiar
      </Text>

      <Text style={styles.subtitulo}>
        Você ainda não faz parte de uma família.
        Crie a sua ou aceite um convite recebido.
      </Text>

      <ConvitesRecebidos
        usuario={usuario}
        onAceito={onGrupoConcluido}
      />

      <TouchableOpacity
        style={styles.botao}
        onPress={() => {
          setCriando(true);
          setErro('');
        }}
      >
        <Text style={styles.botaoTexto}>
          Criar família
        </Text>
      </TouchableOpacity>

      {onPular && (
        <TouchableOpacity
          style={styles.botaoPular}
          onPress={onPular}
        >
          <Text style={styles.botaoPularTexto}>
            Pular por agora
          </Text>
        </TouchableOpacity>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({

  scroll: {
    flex: 1,
    backgroundColor: cores.fundo,
  },

  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
    paddingTop: 70,
    backgroundColor: cores.fundo,
  },

  titulo: {
    fontSize: 26,
    fontFamily: fontes.titulo,
    color: cores.texto,
    marginBottom: 12,
    textAlign: 'center',
  },

  subtitulo: {
    textAlign: 'center',
    color: cores.textoSecundario,
    marginBottom: 30,
    lineHeight: 21,
  },

  input: {
    width: '90%',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.botaoSecundario + 4,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: cores.superficie,
    color: cores.texto,
  },

  botao: {
    width: '90%',
    padding: 16,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    marginBottom: 12,
  },

  botaoDesabilitado: {
    opacity: 0.7,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  botaoSecundario: {
    width: '90%',
    padding: 16,
    borderRadius: raio.botaoSecundario,
    borderWidth: 1,
    borderColor: cores.primaria,
    alignItems: 'center',
    marginBottom: 12,
  },

  botaoSecundarioTexto: {
    color: cores.primaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },

  botaoPular: {
    padding: 12,
  },

  botaoPularTexto: {
    color: cores.textoSecundario,
    fontSize: 15,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 10,
  },

  instrucao: {
    width: '90%',
    textAlign: 'center',
    color: cores.textoSecundario,
    marginBottom: 30,
    lineHeight: 21,
  },

});
