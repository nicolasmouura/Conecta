/*
 * Tela Mapa: junta membros, localizações e perfis da família e mostra
 * o mapa com os cards.
 */

import { StyleSheet, View } from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';

import Mapa from './Mapa';
import StatusLocalizacao from './StatusLocalizacao';
import CardsFamiliares from './CardsFamiliares';
import { descreverLocalizacao } from './compartilharLocalizacao';

import {
  montarMarcadores,
  observarFamiliares,
} from '../dados/buscarFamiliares';
import { observarMembros } from '../dados/grupo';
import { buscarPerfisDosMembros } from '../dados/salvarUsuario';
import { montarCardsFamiliares } from '../dados/presencaFamiliar';
import { observarLugar } from '../dados/lugares';

// Atualiza os textos "Atualizado há X min" sem novas leituras.
const INTERVALO_RELOGIO = 30 * 1000;

// O compartilhamento da localização roda no App
// (useCompartilharLocalizacao); aqui a família é exibida.
export default function TelaMapa({ usuario, grupoId, localizacao }) {
  // null = ainda carregando
  const [membros, setMembros] = useState(null);
  const [localizacoes, setLocalizacoes] = useState(null);
  const [erro, setErro] = useState('');
  const [agora, setAgora] = useState(() => Date.now());

  // Fotos (usuarios/{uid}.foto) dos membros, lidas uma vez por membro.
  const [perfis, setPerfis] = useState({});

  // Minha casa (privada: só eu leio). undefined = carregando.
  const [minhaCasa, setMinhaCasa] = useState(undefined);

  useEffect(() => {
    if (!usuario?.uid) return;

    return observarLugar(usuario.uid, 'casa', setMinhaCasa, (e) => {
      console.log('Casa indisponível:', e.code || e.message);
    });
  }, [usuario?.uid]);

  // Familiar selecionado no card/marcador e pedido de centralização.
  const [selecionado, setSelecionado] = useState(null);
  const [foco, setFoco] = useState(null);

  // Um listener para os membros e um para as localizações da família.
  // Ambos são encerrados ao sair do mapa.
  useEffect(() => {
    if (!grupoId) {
      setMembros([]);
      setLocalizacoes([]);
      return;
    }

    function falhou(e) {
      console.error('Erro ao carregar o mapa da família:', e);
      setErro('Não foi possível carregar as localizações da família.');
    }

    const cancelarMembros = observarMembros(grupoId, setMembros, falhou);
    const cancelarLocalizacoes = observarFamiliares(
      grupoId,
      setLocalizacoes,
      falhou
    );

    return () => {
      cancelarMembros();
      cancelarLocalizacoes();
    };
  }, [grupoId]);

  // Recarrega as fotos só quando alguém entra ou sai da família.
  const uidsMembros = (membros || [])
    .filter((membro) => membro.status === 'ativo')
    .map((membro) => membro.uid)
    .sort()
    .join(',');

  useEffect(() => {
    if (!uidsMembros) return;

    let ativo = true;

    buscarPerfisDosMembros(uidsMembros.split(',')).then((resultado) => {
      if (ativo) setPerfis(resultado);
    });

    return () => {
      ativo = false;
    };
  }, [uidsMembros]);

  useEffect(() => {
    const relogio = setInterval(
      () => setAgora(Date.now()),
      INTERVALO_RELOGIO
    );

    return () => clearInterval(relogio);
  }, []);

  const coordenadas = localizacao.coordenadas;

  const minhaPosicao =
    localizacao.status === 'compartilhando' && coordenadas
      ? {
          latitude: coordenadas.latitude,
          longitude: coordenadas.longitude,
          atualizadoEm: localizacao.atualizadoEm,
        }
      : null;

  const pronto = membros !== null && localizacoes !== null;

  const { marcadores, semLocalizacao } = useMemo(
    () =>
      montarMarcadores({
        membros: membros || [],
        localizacoes: localizacoes || [],
        meuUid: usuario?.uid,
        meuNome: usuario?.nome,
        minhaPosicao,
        agora,
      }),
    [
      membros,
      localizacoes,
      usuario?.uid,
      usuario?.nome,
      minhaPosicao?.latitude,
      minhaPosicao?.longitude,
      minhaPosicao?.atualizadoEm,
      agora,
    ]
  );

  // Minha referência para a distância: posição atual (GPS) ou, na
  // falta dela, minha última posição conhecida.
  const meuMarcador = marcadores.find((marcador) => marcador.voce) || null;

  const cards = useMemo(
    () =>
      montarCardsFamiliares({
        marcadores,
        semLocalizacao,
        perfis,
        membros,
        minhaPosicao: meuMarcador,
        minhaCasa,
        agora,
      }),
    [marcadores, semLocalizacao, perfis, membros, meuMarcador, minhaCasa, agora]
  );

  // Marcadores com a mesma foto/status dos cards (consistência).
  const marcadoresNoMapa = useMemo(() => {
    const cardPorUid = Object.fromEntries(cards.map((card) => [card.uid, card]));

    return marcadores.map((marcador) => ({
      ...marcador,
      foto: cardPorUid[marcador.uid]?.foto || null,
      online: cardPorUid[marcador.uid]?.online || false,
      visto: cardPorUid[marcador.uid]?.visto || marcador.detalhe,
    }));
  }, [marcadores, cards]);

  function selecionar(uid) {
    setSelecionado(uid);
    setFoco((atual) => ({ uid, pedido: (atual?.pedido || 0) + 1 }));
  }

  const descricao = descreverLocalizacao(localizacao);
  const linhas = [descricao.titulo, descricao.detalhe];

  if (erro) {
    linhas.push(erro);
  } else if (pronto) {
    if (descricao.ativo && !marcadores.some((marcador) => marcador.voce)) {
      linhas.push('Sua localização ainda não está disponível.');
    }

    if (marcadores.length === 0) {
      linhas.push('Nenhuma localização disponível.');
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" hidden />

      <View style={styles.areaMapa}>
        <Mapa
          marcadores={marcadoresNoMapa}
          pronto={pronto}
          selecionado={selecionado}
          foco={foco}
          onSelecionar={selecionar}
          minhaCasa={minhaCasa}
          centroInicial={coordenadas}
        />

        <StatusLocalizacao
          ativo={descricao.ativo}
          texto={linhas.join('\n')}
        />
      </View>

      <CardsFamiliares
        cards={cards}
        selecionado={selecionado}
        onSelecionar={selecionar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  areaMapa: {
    flex: 1,
  },
});
