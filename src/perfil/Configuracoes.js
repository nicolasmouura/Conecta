import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Feather } from '@expo/vector-icons';

import { biometriaDisponivel } from '../dados/biometria';
import {
  estadoPermissao,
  lerPreferencias,
  notificar,
  pedirPermissao,
  PREFERENCIAS_PADRAO,
  salvarPreferencias,
  TIPOS_NOTIFICACAO,
} from '../dados/notificacoes';
import EditarInformacoes from './EditarInformacoes';
import MeusLugares from '../lugares/MeusLugares';
import BotaoVoltar from '../navegacao/BotaoVoltar';
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
    chave: 'notificacoes',
    label: 'Notificações',
    icone: 'bell',
  },
  {
    chave: 'seguranca',
    label: 'Segurança',
    icone: 'lock',
  },
];

export default function Configuracoes({
  usuario,
  perfil,
  onSalvarPerfil,
  onCasaSalva,
  posicaoAtual,
  onSair,
}) {
  const [editarAberto, setEditarAberto] =
    useState(false);

  const [lugaresAberto, setLugaresAberto] =
    useState(false);

  const [notificacoesAbertas, setNotificacoesAbertas] =
    useState(false);

  const [notificacoes, setNotificacoes] = useState(
    PREFERENCIAS_PADRAO
  );

  // Permissão do aparelho: null = verificando.
  const [permissao, setPermissao] = useState(null);

  const [segurancaAberta, setSegurancaAberta] =
    useState(false);

  // null = carregando
  const [biometriaOk, setBiometriaOk] = useState(null);

  const uid = usuario?.uid;

  useEffect(() => {
    if (!uid) {
      setNotificacoes(PREFERENCIAS_PADRAO);
      return;
    }

    lerPreferencias(uid).then(setNotificacoes);
  }, [uid]);

  // Com a tela de notificações aberta, confere a permissão também
  // ao voltar das configurações do aparelho.
  useEffect(() => {
    if (!notificacoesAbertas) return undefined;

    estadoPermissao().then(setPermissao);

    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') estadoPermissao().then(setPermissao);
    });

    return () => assinatura.remove();
  }, [notificacoesAbertas]);

  async function alternarNotificacao(chave) {
    const novasConfiguracoes = {
      ...notificacoes,
      [chave]: !notificacoes[chave],
    };

    setNotificacoes(novasConfiguracoes);

    if (!uid) {
      return;
    }

    try {
      await salvarPreferencias(uid, novasConfiguracoes);
    } catch (error) {
      console.error(
        'Erro ao salvar configurações de notificações:',
        error
      );
    }
  }

  async function permitirNotificacoes() {
    if (permissao && !permissao.podePedir) {
      Linking.openSettings();
      return;
    }

    await pedirPermissao();
    setPermissao(await estadoPermissao());
  }

  async function testarNotificacao() {
    const permitido = await pedirPermissao();

    setPermissao(await estadoPermissao());

    if (!permitido) {
      Alert.alert(
        'Notificações bloqueadas',
        'Permita as notificações do Conecta nas configurações do aparelho.'
      );
      return;
    }

    await notificar({
      titulo: 'Conecta',
      corpo: 'As notificações estão funcionando.',
    });
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

    if (chave === 'notificacoes') {
      setNotificacoesAbertas(true);
      return;
    }

    if (chave === 'seguranca') {
      abrirSeguranca();
    }
  }

  async function abrirSeguranca() {
    setSegurancaAberta(true);
    setBiometriaOk(null);

    setBiometriaOk(await biometriaDisponivel());
  }

  function voltarConfiguracoes() {
    setNotificacoesAbertas(false);
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

        {biometriaOk === null ? (
          <ActivityIndicator color={cores.primaria} />
        ) : (
          <>
            <View style={styles.notificacao}>
              <View style={styles.notificacaoIcone}>
                <Feather
                  name="lock"
                  size={19}
                  color={cores.primaria}
                />
              </View>

              <View style={styles.notificacaoConteudo}>
                <Text style={styles.notificacaoTitulo}>
                  Reconhecimento facial obrigatório
                </Text>

                <Text style={styles.notificacaoDescricao}>
                  Sempre que você abre o Conecta ou volta para
                  ele, o reconhecimento facial é pedido. Depois
                  de 3 falhas, é preciso entrar com e-mail e
                  senha.
                </Text>
              </View>

              <Feather
                name={biometriaOk ? 'check-circle' : 'alert-circle'}
                size={20}
                color={biometriaOk ? cores.online : cores.erro}
              />
            </View>

            {!biometriaOk && (
              <Text style={styles.aviso}>
                Este aparelho não tem biometria cadastrada.
                Cadastre seu rosto (ou outra biometria) nas
                configurações do aparelho: sem ela não é
                possível entrar no Conecta.
              </Text>
            )}

            <Text style={styles.aviso}>
              Ao tocar em "Sair do aplicativo", a próxima
              entrada pede e-mail, senha e reconhecimento
              facial.
            </Text>
          </>
        )}
      </View>
    );
  }

  if (notificacoesAbertas) {
    return (
      <View style={styles.container}>
        <BotaoVoltar
          label="Configurações"
          onPress={voltarConfiguracoes}
        />

        <Text style={styles.title}>
          Notificações
        </Text>

        <Text style={styles.subtitulo}>
          Escolha quais notificações você deseja receber.
        </Text>

        {permissao && !permissao.permitido ? (
          <View style={styles.bloqueio}>
            <Feather
              name="bell-off"
              size={18}
              color={cores.erro}
            />

            <View style={styles.notificacaoConteudo}>
              <Text style={styles.bloqueioTexto}>
                As notificações do Conecta estão desativadas
                neste aparelho.
              </Text>

              <TouchableOpacity onPress={permitirNotificacoes}>
                <Text style={styles.link}>
                  {permissao.podePedir
                    ? 'Permitir notificações'
                    : 'Abrir configurações do aparelho'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {TIPOS_NOTIFICACAO.map((item) => (
          <View
            key={item.chave}
            style={styles.notificacao}
          >
            <View style={styles.notificacaoIcone}>
              <Feather
                name={item.icone}
                size={19}
                color={cores.primaria}
              />
            </View>

            <View style={styles.notificacaoConteudo}>
              <Text style={styles.notificacaoTitulo}>
                {item.titulo}
              </Text>

              <Text style={styles.notificacaoDescricao}>
                {item.descricao}
              </Text>
            </View>

            <Switch
              value={notificacoes[item.chave]}
              onValueChange={() =>
                alternarNotificacao(item.chave)
              }
              trackColor={{
                false: cores.borda,
                true: cores.primaria,
              }}
              thumbColor={cores.superficie}
            />
          </View>
        ))}

        <TouchableOpacity
          style={styles.teste}
          onPress={testarNotificacao}
        >
          <Feather
            name="send"
            size={16}
            color={cores.primaria}
          />

          <Text style={styles.link}>
            Enviar notificação de teste
          </Text>
        </TouchableOpacity>
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

  subtitulo: {
    fontSize: 14,
    color: cores.textoSecundario,
    lineHeight: 20,
    marginBottom: 18,
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

  notificacao: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },

  notificacaoIcone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.superficieAlternativa,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  notificacaoConteudo: {
    flex: 1,
    paddingRight: 10,
  },

  notificacaoTitulo: {
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

  notificacaoDescricao: {
    fontSize: 12,
    color: cores.textoSecundario,
    lineHeight: 17,
  },

  bloqueio: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: cores.erro,
    borderRadius: 12,
  },

  bloqueioTexto: {
    fontSize: 13,
    lineHeight: 19,
    color: cores.texto,
    marginBottom: 6,
  },

  link: {
    fontSize: 14,
    fontFamily: fontes.destaque,
    color: cores.primaria,
  },

  teste: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingVertical: 16,
  },
});