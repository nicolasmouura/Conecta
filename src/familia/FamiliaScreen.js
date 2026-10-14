/*
 * Tela Minha Família: nome da família, membros e convites pendentes,
 * convidar familiar e sair da família.
 */

import { useState, useEffect } from 'react';

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';

import ListaMembros from './ListaMembros';
import ConvidarMembro from './ConvidarMembro';
import GrupoScreen from '../grupo/GrupoScreen';

import {
  buscarGrupoPorId,
  observarMembros,
  sairDaFamilia,
} from '../dados/grupo';

import { observarConvitesPendentesDoGrupo } from '../dados/convites';
import { buscarPerfisDosMembros } from '../dados/salvarUsuario';

import { useEspacoTopo } from '../navegacao/BotaoMenu';
import { cores, fontes, raio } from '../theme/theme';

export default function FamiliaScreen({
  grupoId,
  usuario,
  onGrupoConcluido,
  onSaiu,
}) {
  // Título abaixo do "‹ Menu" (que acompanha a área segura).
  const espacoTopo = useEspacoTopo(60);
  const [grupoInfo, setGrupoInfo] = useState(null);
  const [membros, setMembros] = useState([]);
  const [convitesPendentes, setConvitesPendentes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [mostrarConvite, setMostrarConvite] = useState(false);
  const [saindo, setSaindo] = useState(false);

  // Perfis (usuarios/{uid}) dos membros, indexados por uid
  const [perfis, setPerfis] = useState({});

  const uidsMembros = membros
    .map((membro) => membro.uid)
    .sort()
    .join(',');

  useEffect(() => {
    if (!uidsMembros) return;

    let ativo = true;

    buscarPerfisDosMembros(uidsMembros.split(',')).then(
      (resultado) => {
        if (ativo) setPerfis(resultado);
      }
    );

    return () => {
      ativo = false;
    };
  }, [uidsMembros]);

  useEffect(() => {
    if (!grupoId || !usuario?.uid) return;

    let ativo = true;
    let cancelarMembros = () => {};
    let cancelarConvites = () => {};

    function falhou(e) {
      console.error('Erro ao carregar família:', e);

      if (ativo) {
        setErro('Não foi possível carregar sua família.');
        setCarregando(false);
      }
    }

    async function carregar() {
      try {
        setCarregando(true);
        setErro('');

        const grupo = await buscarGrupoPorId(grupoId);

        if (!ativo) return;

        if (!grupo) {
          setErro('Família não encontrada.');
          setCarregando(false);
          return;
        }

        setGrupoInfo(grupo);

        cancelarMembros = observarMembros(
          grupoId,
          (dados) => {
            setMembros(dados);
            setCarregando(false);
          },
          falhou
        );

        cancelarConvites = observarConvitesPendentesDoGrupo(
          grupoId,
          setConvitesPendentes,
          falhou
        );
      } catch (e) {
        falhou(e);
      }
    }

    carregar();

    return () => {
      ativo = false;
      cancelarMembros();
      cancelarConvites();
    };
  }, [grupoId, usuario?.uid]);

  if (!grupoId) {
    return (
      <GrupoScreen
        usuario={usuario}
        onGrupoConcluido={onGrupoConcluido}
      />
    );
  }

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={cores.primaria} />
        <Text style={styles.subtitle}>Carregando família...</Text>
      </View>
    );
  }

  if (erro) {
    return (
      <View style={styles.centro}>
        <Text style={styles.erro}>{erro}</Text>
      </View>
    );
  }

  const meuRegistro = membros.find(
    (membro) => membro.uid === usuario.uid
  );

  async function sair() {
    try {
      setSaindo(true);

      await sairDaFamilia(usuario.uid);

      onSaiu?.();
    } catch (e) {
      console.log('Não saiu da família:', e.code || e.message);
      setSaindo(false);

      Alert.alert(
        'Não foi possível sair',
        e.message === 'SOS_ATIVO'
          ? 'Você tem um SOS ativo. Encerre-o antes de sair da família (Meu Perfil → Configurações → Segurança).'
          : 'Tente novamente em instantes.'
      );
    }
  }

  // Quem assume se eu (administrador) sair: o membro mais antigo.
  function confirmarSaida() {
    const outros = membros
      .filter((membro) => membro.uid !== usuario.uid)
      .sort((a, b) => ((a.entrouEm || '') < (b.entrouEm || '') ? -1 : 1));

    let mensagem = 'Você deixa de ver a família no mapa e ela deixa de ver você.';

    if (outros.length === 0) {
      mensagem = 'Você é o único membro: a família será apagada.';
    } else if (grupoInfo?.administradorUid === usuario.uid) {
      mensagem += ` ${outros[0].nome || 'O membro mais antigo'} passa a ser o administrador.`;
    }

    Alert.alert('Sair da família', mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: sair },
    ]);
  }

  const lista = [
    ...membros.map((membro) => ({
      ...membro,
      perfil: perfis[membro.uid],
    })),
    ...convitesPendentes.map((convite) => ({
      id: `convite_${convite.id}`,
      nome: convite.paraEmail,
      status: 'pendente',
    })),
  ];

  return (
    <View style={[styles.container, { paddingTop: espacoTopo }]}>
      <Text style={styles.title}>
        Minha Família
      </Text>

      <Text style={styles.nomeFamilia}>
        {grupoInfo?.nome}
      </Text>

      <Text style={styles.subtitle}>
        {membros.length === 1
          ? '1 membro ativo'
          : `${membros.length} membros ativos`}
      </Text>

      <ListaMembros
        membros={lista}
        uidAtual={usuario.uid}
      />

      <TouchableOpacity
        style={styles.botaoConvidar}
        onPress={() => setMostrarConvite(true)}
        disabled={!meuRegistro}
      >
        <Text style={styles.botaoConvidarTexto}>
          + Convidar familiar
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.botaoSair}
        onPress={confirmarSaida}
        disabled={!meuRegistro || saindo}
      >
        {saindo ? (
          <ActivityIndicator color={cores.erro} />
        ) : (
          <Text style={styles.botaoSairTexto}>Sair da família</Text>
        )}
      </TouchableOpacity>

      {meuRegistro && (
        <ConvidarMembro
          visivel={mostrarConvite}
          grupo={grupoInfo}
          remetente={meuRegistro}
          onFechar={() => setMostrarConvite(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    backgroundColor: cores.fundo,
  },

  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 25,
    backgroundColor: cores.fundo,
  },

  title: {
    fontSize: 26,
    fontFamily: fontes.titulo,
    color: cores.texto,
    marginBottom: 4,
  },

  nomeFamilia: {
    fontSize: 18,
    fontFamily: fontes.destaque,
    color: cores.primaria,
    marginBottom: 4,
  },

  subtitle: {
    width: '90%',
    textAlign: 'center',
    color: cores.textoSecundario,
    marginBottom: 20,
  },

  erro: {
    color: cores.erro,
    textAlign: 'center',
    fontSize: 15,
  },

  botaoConvidar: {
    width: '90%',
    padding: 16,
    borderRadius: raio.pilula,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },

  botaoConvidarTexto: {
    color: cores.textoSobrePrimaria,
    fontSize: 16,
    fontFamily: fontes.destaque,
  },
  botaoSair: {
    marginTop: -8,
    marginBottom: 16,
    padding: 8,
    alignItems: 'center',
  },
  botaoSairTexto: {
    color: cores.erro,
    fontSize: 15,
    fontFamily: fontes.destaque,
  },
});
