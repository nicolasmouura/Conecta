import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import EditarLugar from '../lugares/EditarLugar';
import BotaoVoltar from '../navegacao/BotaoVoltar';
import { observarLugar, salvarLugar, TIPOS_LUGAR } from '../dados/lugares';
import {
  cpfValido,
  LIMITES_PERFIL,
  mascararDocumento,
  montarAlteracoes,
  validarDadosEditaveis,
} from '../dados/salvarUsuario';
import { cores, fontes, raio } from '../theme/theme';

const TIPO_CASA = TIPOS_LUGAR.find((tipo) => tipo.id === 'casa');

function CampoBloqueado({ label, valor }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.bloqueado}>
        <Text style={styles.bloqueadoTexto} numberOfLines={1}>
          {valor || 'Não informado'}
        </Text>

        <View style={styles.cadeado}>
          <Feather name="lock" size={14} color={cores.textoSecundario} />
          <Text style={styles.cadeadoTexto}>Não editável</Text>
        </View>
      </View>
    </View>
  );
}

/*
 * Configurações → Editar informações. Nome, telefone e endereço são
 * editáveis; e-mail e CPF aparecem bloqueados. O endereço é o da Casa:
 * abre o mesmo formulário (EditarLugar) e é salvo na hora, junto com o
 * marcador da casa no mapa (lugares.salvarLugar).
 */
export default function EditarInformacoes({
  perfil,
  posicaoAtual,
  onSalvar,
  onCasaSalva,
  onVoltar,
}) {
  const [dados, setDados] = useState({
    nome: perfil.nome,
    telefone: perfil.telefone,
    endereco: perfil.endereco,
    enderecoDetalhado: perfil.enderecoDetalhado,
    cpf: '',
  });

  // Casa salva (undefined = carregando).
  const [casa, setCasa] = useState(undefined);
  const [enderecoAberto, setEnderecoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Conta antiga sem CPF: pode informar uma única vez.
  const semCPF = !perfil.documento;

  useEffect(() => {
    return observarLugar(perfil.uid, 'casa', setCasa, (e) => {
      console.log('Casa indisponível:', e.code || e.message);
      setCasa(null);
    });
  }, [perfil.uid]);

  function alterarCampo(chave, valor) {
    setDados((atuais) => ({ ...atuais, [chave]: valor }));
    setErro('');
    setSucesso('');
  }

  // Chamado pelo EditarLugar, que mostra o erro se falhar.
  async function salvarEndereco(lugar) {
    const salvo = await salvarLugar(perfil.uid, 'casa', lugar);

    setDados((atuais) => ({
      ...atuais,
      endereco: salvo.endereco,
      enderecoDetalhado: salvo.enderecoDetalhado,
    }));
    onCasaSalva?.(salvo);
    setEnderecoAberto(false);
    setErro('');
    setSucesso('Endereço salvo. A casa no mapa também foi atualizada.');
  }

  async function salvar() {
    const mensagemErro = validarDadosEditaveis(dados);

    if (mensagemErro) {
      setErro(mensagemErro);
      return;
    }

    if (semCPF && dados.cpf && !cpfValido(dados.cpf)) {
      setErro('Digite um CPF válido.');
      return;
    }

    try {
      setErro('');
      setSucesso('');
      setSalvando(true);

      const salvos = await onSalvar(montarAlteracoes(perfil, dados));

      setDados((atuais) => ({ ...atuais, ...salvos, cpf: '' }));
      setSucesso('Dados atualizados com sucesso.');
    } catch (e) {
      console.error('Erro ao atualizar perfil:', e.code || e.message);
      setErro('Não foi possível atualizar seus dados.\nTente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.container}>
      <BotaoVoltar label="Configurações" onPress={onVoltar} desabilitado={salvando} />

      <Text style={styles.titulo}>Dados pessoais</Text>

      <Text style={styles.label}>Nome</Text>
      <TextInput
        style={styles.input}
        value={dados.nome}
        onChangeText={(valor) => alterarCampo('nome', valor)}
        placeholder="Seu nome completo"
        placeholderTextColor={cores.textoSecundario}
        autoCapitalize="words"
        maxLength={LIMITES_PERFIL.nome}
        editable={!salvando}
      />

      <CampoBloqueado label="E-mail" valor={perfil.email} />

      {semCPF ? (
        <>
          <Text style={styles.label}>CPF</Text>
          <TextInput
            style={styles.input}
            value={dados.cpf}
            onChangeText={(valor) => alterarCampo('cpf', valor)}
            placeholder="000.000.000-00"
            placeholderTextColor={cores.textoSecundario}
            keyboardType="number-pad"
            maxLength={14}
            editable={!salvando}
          />
          <Text style={styles.dica}>
            Informe uma única vez: depois de salvo, o CPF não pode ser alterado.
          </Text>
        </>
      ) : (
        <CampoBloqueado label="CPF" valor={mascararDocumento(perfil.documento)} />
      )}

      <Text style={styles.label}>Telefone</Text>
      <TextInput
        style={styles.input}
        value={dados.telefone}
        onChangeText={(valor) => alterarCampo('telefone', valor)}
        placeholder="(21) 98765-4321"
        placeholderTextColor={cores.textoSecundario}
        keyboardType="phone-pad"
        maxLength={LIMITES_PERFIL.telefone}
        editable={!salvando}
      />

      <Text style={styles.label}>Endereço</Text>
      <TouchableOpacity
        style={styles.endereco}
        onPress={() => setEnderecoAberto(true)}
        disabled={salvando || casa === undefined}
      >
        <Text
          style={[styles.enderecoTexto, !dados.endereco && styles.enderecoVazio]}
          numberOfLines={3}
        >
          {dados.endereco || 'Toque para preencher (país, cidade, rua...)'}
        </Text>

        <Feather name="edit-2" size={16} color={cores.primaria} />
      </TouchableOpacity>

      <Text style={styles.dica}>
        É o endereço da sua casa no mapa: os dois mudam juntos.
      </Text>

      {enderecoAberto ? (
        <EditarLugar
          tipo={TIPO_CASA}
          lugar={casa}
          enderecoInicial={dados.enderecoDetalhado}
          posicaoAtual={posicaoAtual}
          onFechar={() => setEnderecoAberto(false)}
          onSalvar={salvarEndereco}
        />
      ) : null}

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      {sucesso ? <Text style={styles.sucesso}>✓ {sucesso}</Text> : null}

      <TouchableOpacity
        style={[styles.botao, salvando && styles.botaoDesabilitado]}
        onPress={salvar}
        disabled={salvando}
      >
        <Text style={styles.botaoTexto}>
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </Text>
      </TouchableOpacity>
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
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 6,
  },

  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.botaoSecundario + 4,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: cores.superficie,
    color: cores.texto,
  },

  bloqueado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.botaoSecundario + 4,
    padding: 14,
    marginBottom: 16,
    backgroundColor: cores.superficieAlternativa,
  },

  bloqueadoTexto: {
    flex: 1,
    fontSize: 16,
    color: cores.textoSecundario,
  },

  cadeado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  cadeadoTexto: {
    fontSize: 12,
    color: cores.textoSecundario,
  },

  endereco: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.botaoSecundario + 4,
    padding: 14,
    marginBottom: 16,
    backgroundColor: cores.superficie,
  },

  enderecoTexto: {
    flex: 1,
    fontSize: 16,
    color: cores.texto,
  },

  enderecoVazio: {
    color: cores.textoSecundario,
  },

  dica: {
    fontSize: 12,
    color: cores.textoSecundario,
    marginTop: -10,
    marginBottom: 16,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
    marginBottom: 12,
  },

  sucesso: {
    color: cores.online,
    fontFamily: fontes.destaque,
    textAlign: 'center',
    marginBottom: 12,
  },

  botao: {
    width: '100%',
    padding: 16,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
    alignItems: 'center',
  },

  botaoDesabilitado: {
    opacity: 0.7,
  },

  botaoTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },
});
