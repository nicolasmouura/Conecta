/*
 * Configurações (em Meu Perfil): Editar informações, Meus lugares,
 * Segurança (encerrar SOS e biometria), Excluir conta e Sair.
 */

import { useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Feather } from '@expo/vector-icons';

import {
  ativarBiometria,
  biometriaDisponivel,
  desativarBiometria,
} from '../dados/biometria';
import EditarInformacoes from './EditarInformacoes';
import ExcluirConta from './ExcluirConta';
import MeusLugares from '../lugares/MeusLugares';
import BotaoVoltar from '../navegacao/BotaoVoltar';
import EncerrarSOS from '../sos/EncerrarSOS';
import { cores, fontes } from '../theme/theme';

const ITENS = [
  {
    chave: 'editar',
    label: 'Editar informações',
    icone: 'edit-2',
  },
  {
    chave: 'lugares',
    label: 'Meus lugares',
    icone: 'home',
  },
  {
    chave: 'seguranca',
    label: 'Segurança',
    icone: 'lock',
  },
  {
    chave: 'excluir',
    label: 'Excluir conta',
    icone: 'trash-2',
  },
];

export default function Configuracoes({
  usuario,
  perfil,
  onSalvarPerfil,
  onCasaSalva,
  posicaoAtual,
  grupoId,
  biometriaLigada,
  onBiometriaAlterada,
  onSair,
  onContaExcluida,
}) {
  const [editarAberto, setEditarAberto] =
    useState(false);

  const [lugaresAberto, setLugaresAberto] =
    useState(false);

  const [segurancaAberta, setSegurancaAberta] =
    useState(false);

  const [excluirAberto, setExcluirAberto] =
    useState(false);

  // null = carregando
  const [biometriaOk, setBiometriaOk] = useState(null);
  const [alterandoBiometria, setAlterandoBiometria] = useState(false);

  // Ligar pede a biometria uma vez (confirma que funciona); desligar não.
  async function alternarBiometria(ligar) {
    setAlterandoBiometria(true);

    try {
      if (ligar) {
        const { ativada, mensagem } = await ativarBiometria(usuario.uid);

        if (ativada) {
          onBiometriaAlterada?.(true);
        } else {
          Alert.alert('Biometria não ativada', mensagem);
        }
      } else {
        await desativarBiometria(usuario.uid);
        onBiometriaAlterada?.(false);
      }
    } catch (erro) {
      console.log('Biometria não alterada:', erro.message);
      Alert.alert('Erro', 'Não foi possível alterar a biometria. Tente novamente.');
    } finally {
      setAlterandoBiometria(false);
    }
  }

  function tocarOpcao(chave) {
    if (chave === 'lugares') {
      setLugaresAberto(true);
      return;
    }

    if (chave === 'editar') {
      if (!perfil) {
        Alert.alert(
          'Aguarde',
          'Seus dados ainda estão carregando.'
        );
        return;
      }

      setEditarAberto(true);
      return;
    }

    if (chave === 'seguranca') {
      abrirSeguranca();
      return;
    }

    if (chave === 'excluir') {
      setExcluirAberto(true);
    }
  }

  async function abrirSeguranca() {
    setSegurancaAberta(true);
    setBiometriaOk(null);

    setBiometriaOk(await biometriaDisponivel());
  }

  function confirmarSaida() {
    Alert.alert(
      'Sair do aplicativo',
      'Tem certeza que deseja sair da sua conta?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: onSair,
        },
      ]
    );
  }

  if (excluirAberto) {
    return (
      <ExcluirConta
        onVoltar={() => setExcluirAberto(false)}
        onExcluida={onContaExcluida}
      />
    );
  }

  if (lugaresAberto) {
    return (
      <MeusLugares
        usuario={usuario}
        posicaoAtual={posicaoAtual}
        onCasaSalva={onCasaSalva}
        onVoltar={() => setLugaresAberto(false)}
      />
    );
  }

  if (editarAberto && perfil) {
    return (
      <EditarInformacoes
        perfil={perfil}
        posicaoAtual={posicaoAtual}
        onSalvar={onSalvarPerfil}
        onCasaSalva={onCasaSalva}
        onVoltar={() => setEditarAberto(false)}
      />
    );
  }

  if (segurancaAberta) {
    return (
      <View style={styles.container}>
        <BotaoVoltar
          label="Configurações"
          onPress={() => setSegurancaAberta(false)}
        />

        <Text style={styles.title}>
          Segurança
        </Text>

        <Text style={styles.secao}>
          SOS
        </Text>

        <EncerrarSOS
          usuario={usuario}
          grupoId={grupoId}
          onSair={onSair}
        />

        <Text style={styles.secao}>
          Acesso ao aplicativo
        </Text>

        {biometriaOk === null ? (
          <ActivityIndicator color={cores.primaria} />
        ) : (
          <>
            <View style={styles.opcao}>
              <View style={styles.opcaoIcone}>
                <Feather
                  name="lock"
                  size={19}
                  color={cores.primaria}
                />
              </View>

              <View style={styles.opcaoConteudo}>
                <Text style={styles.opcaoTitulo}>
                  Entrar com biometria
                </Text>

                <Text style={styles.opcaoDescricao}>
                  Ligada, o reconhecimento facial ou a digital é
                  pedido sempre que você abre o Conecta ou volta
                  para ele. Depois de 3 falhas, é preciso entrar
                  com e-mail e senha.
                </Text>
              </View>

              {alterandoBiometria ? (
                <ActivityIndicator color={cores.primaria} />
              ) : (
                <Switch
                  value={Boolean(biometriaLigada)}
                  onValueChange={alternarBiometria}
                  disabled={!biometriaOk && !biometriaLigada}
                  trackColor={{ true: cores.primaria }}
                />
              )}
            </View>

            {!biometriaOk && (
              <Text style={styles.aviso}>
                Este aparelho não tem biometria cadastrada.
                Cadastre seu rosto ou digital nas configurações
                do aparelho para poder usar a biometria no
                Conecta.
              </Text>
            )}

            <Text style={styles.aviso}>
              Ao tocar em “Sair do aplicativo”, a próxima
              entrada pede e-mail e senha.
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Configurações
      </Text>

      {ITENS.map((item) => (
        <TouchableOpacity
          key={item.chave}
          style={styles.item}
          onPress={() => tocarOpcao(item.chave)}
        >
          <View style={styles.itemEsquerda}>
            <Feather
              name={item.icone}
              size={18}
              color={cores.textoSecundario}
            />

            <Text style={styles.itemText}>
              {item.label}
            </Text>
          </View>

          <Feather
            name="chevron-right"
            size={18}
            color={cores.textoSecundario}
          />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.itemSair}
        onPress={confirmarSaida}
      >
        <View style={styles.itemEsquerda}>
          <Feather
            name="log-out"
            size={18}
            color={cores.erro}
          />

          <Text style={styles.textoSair}>
            Sair do aplicativo
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '90%',
    marginTop: 30,
  },

  title: {
    fontSize: 20,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 8,
  },

  secao: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginTop: 14,
    marginBottom: 8,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },

  itemEsquerda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  itemText: {
    fontSize: 16,
    color: cores.texto,
  },

  itemSair: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 17,
    marginTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },

  textoSair: {
    fontSize: 16,
    color: cores.erro,
    fontFamily: fontes.destaque,
  },

  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },

  opcaoIcone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.superficieAlternativa,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  opcaoConteudo: {
    flex: 1,
    paddingRight: 10,
  },

  opcaoTitulo: {
    fontSize: 15,
    fontFamily: fontes.destaque,
    color: cores.texto,
    marginBottom: 3,
  },

  aviso: {
    fontSize: 13,
    lineHeight: 19,
    color: cores.textoSecundario,
    marginTop: 14,
  },

  opcaoDescricao: {
    fontSize: 12,
    color: cores.textoSecundario,
    lineHeight: 17,
  },
});