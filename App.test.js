/*
 * Testes da raiz do app (App.js): sessão, biometria, e-mail confirmado,
 * família, navegação entre as telas e "Sair". As telas têm testes
 * próprios e aqui são simuladas; o perfil vem do Firestore falso.
 */

import { Alert, AppState, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useFonts } from '@expo-google-fonts/poppins';

import App from './App';
import { ativarBiometria, biometriaAtiva, desativarBiometria } from './src/dados/biometria';
import { processarFila } from './src/dados/filaEnvio';
import { buscarTelefonesDaFamilia } from './src/dados/smsSOS';
import { garantirEntradaDiretorio } from './src/dados/salvarUsuario';
import { apagarSenhaOffline } from './src/dados/senhaOffline';
import { useCompartilharLocalizacao } from './src/mapa/compartilharLocalizacao';

jest.mock('@expo-google-fonts/poppins', () => ({
  useFonts: jest.fn(),
  Poppins_700Bold: 'bold',
  Poppins_600SemiBold: 'semibold',
}));

jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));

jest.mock('./src/dados/biometria', () => ({
  ativarBiometria: jest.fn(),
  biometriaAtiva: jest.fn(),
  desativarBiometria: jest.fn(),
}));
jest.mock('./src/dados/filaEnvio', () => ({ processarFila: jest.fn() }));
jest.mock('./src/dados/smsSOS', () => ({ buscarTelefonesDaFamilia: jest.fn() }));
jest.mock('./src/dados/senhaOffline', () => ({ apagarSenhaOffline: jest.fn() }));
jest.mock('./src/dados/salvarUsuario', () => ({ garantirEntradaDiretorio: jest.fn() }));
jest.mock('./src/mapa/compartilharLocalizacao', () => ({ useCompartilharLocalizacao: jest.fn() }));

/*
 * Tela simulada: mostra o nome e um botão por callback (botoes:
 * { texto: [nomeDaProp, ...argumentos] }).
 */
function mockTela(nome, botoes = {}) {
  return function Tela(props) {
    const { Text, TouchableOpacity, View } = require('react-native');

    return (
      <View>
        <Text>Tela {nome}</Text>
        {props.aviso ? <Text>Aviso: {props.aviso}</Text> : null}
        {Object.entries(botoes).map(([texto, [prop, ...args]]) => (
          <TouchableOpacity key={texto} onPress={() => props[prop]?.(...args)}>
            <Text>{texto}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };
}

jest.mock('./src/autenticacao/AutenticacaoScreen', () =>
  mockTela('Autenticação', {
    Entrar: ['onAutenticado', { uid: 'u1', email: 'ana@exemplo.com' }],
    Cadastrar: ['onAutenticado', { uid: 'u1', email: 'ana@exemplo.com' }, { contaNova: true }],
  })
);
jest.mock('./src/autenticacao/VerificarEmail', () =>
  mockTela('VerificarEmail', { 'E-mail confirmado': ['onConfirmado'], 'Sair do e-mail': ['onSair'] })
);
jest.mock('./src/biometria/VerificaBiometria', () =>
  mockTela('Biometria', { Desbloquear: ['onDesbloqueado'], 'Esgotar tentativas': ['onEncerrar', '3 falhas.'] })
);
jest.mock('./src/grupo/GrupoScreen', () =>
  mockTela('Grupo', { 'Criar grupo': ['onGrupoConcluido', 'g9'], Pular: ['onPular'] })
);
jest.mock('./Components/Menu', () =>
  mockTela('Menu', {
    'Abrir mapa': ['onSelect', 'mapa'],
    'Abrir família': ['onSelect', 'familia'],
    'Abrir perfil': ['onSelect', 'perfil'],
    'Abrir SOS': ['onSelect', 'sos'],
    'Abrir histórico': ['onSelect', 'historico'],
  })
);
jest.mock('./src/mapa/TelaMapa', () => mockTela('Mapa'));
jest.mock('./src/familia/FamiliaScreen', () => mockTela('Família', { 'Sair da família': ['onSaiu'] }));
jest.mock('./src/sos/SOSScreen', () => mockTela('SOS'));
jest.mock('./src/historico/HistoricoScreen', () => mockTela('Histórico'));
jest.mock('./src/perfil/PerfilScreen', () =>
  mockTela('Perfil', {
    'Sem endereço': ['onEnderecoPendente', true],
    'Com endereço': ['onEnderecoPendente', false],
    'Abrir câmera': ['onTelaCheia', true],
    'Sair da conta': ['onSair'],
    'Conta excluída': ['onContaExcluida'],
    'Mudar nome': ['onPerfilAtualizado', { nome: 'Ana Lima' }],
  })
);

const firestore = require('firebase/firestore');
const config = require('./src/config/firebase');
const local = require('./src/dados/armazenamentoLocal');

const ANA = { uid: 'u1', email: 'ana@exemplo.com', emailVerified: true };

let mudarSessao;
let mudarApp;
let voltarAndroid;

beforeEach(async () => {
  firestore.__limpar();
  await local.apagarDadosLocais();
  firestore.__semear('usuarios/u1', { nome: 'Ana', email: 'ana@exemplo.com', grupoId: 'g1' });
  config.auth.currentUser = { ...ANA };

  useFonts.mockReturnValue([true]);
  biometriaAtiva.mockResolvedValue(false);
  ativarBiometria.mockResolvedValue({ ativada: true, mensagem: '' });
  desativarBiometria.mockResolvedValue();
  apagarSenhaOffline.mockResolvedValue();
  garantirEntradaDiretorio.mockResolvedValue();
  processarFila.mockResolvedValue();
  buscarTelefonesDaFamilia.mockResolvedValue([]);
  useCompartilharLocalizacao.mockReturnValue({ status: 'compartilhando', coordenadas: null });
  signOut.mockResolvedValue();
  onAuthStateChanged.mockImplementation((_auth, callback) => {
    mudarSessao = callback;
    return jest.fn();
  });

  voltarAndroid = null;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, ouvinte) => {
    voltarAndroid = ouvinte;
    return { remove: () => (voltarAndroid = null) };
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, ouvinte) => {
    mudarApp = ouvinte;
    return { remove: jest.fn() };
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function abrir(sessao = ANA) {
  await render(<App />);
  await act(async () => {
    await mudarSessao(sessao);
    await esperar();
  });
}

const tocar = async (texto) => {
  await fireEvent.press(screen.getByText(texto));
  await act(() => esperar());
};

// Toca num botão do último Alert.
async function responderAlerta(texto) {
  const botoes = Alert.alert.mock.calls.at(-1)[2];
  await act(async () => {
    await botoes.find((botao) => botao.text === texto).onPress();
    await esperar();
  });
}

describe('App', () => {
  it('sem as fontes, não mostra nada', async () => {
    useFonts.mockReturnValue([false]);

    await render(<App />);

    expect(screen.toJSON()).toBeNull();
  });

  it('carregando enquanto a sessão é restaurada', async () => {
    await render(<App />);

    expect(screen.getByText('Carregando...')).toBeOnTheScreen();
  });

  describe('sessão', () => {
    it('sessão salva sem biometria: entra direto no Menu', async () => {
      await abrir();

      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
      expect(processarFila).toHaveBeenCalledWith('u1');
      expect(buscarTelefonesDaFamilia).toHaveBeenCalledWith('g1', 'u1');
      expect(garantirEntradaDiretorio).toHaveBeenCalledWith('u1');
      expect(useCompartilharLocalizacao).toHaveBeenLastCalledWith(expect.objectContaining({ uid: 'u1', nome: 'Ana' }), 'g1');
    });

    it('guarda a cópia da sessão para abrir sem internet', async () => {
      await abrir();

      expect(await local.lerLocal('sessao')).toEqual({ uid: 'u1', nome: 'Ana', email: 'ana@exemplo.com', grupoId: 'g1' });
    });

    it('sem sessão: tela de entrada', async () => {
      await abrir(null);

      expect(screen.getByText('Tela Autenticação')).toBeOnTheScreen();
    });

    it('entrar pelo login', async () => {
      await abrir(null);

      await tocar('Entrar');

      expect(biometriaAtiva).toHaveBeenCalledWith('u1');
      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
    });

    it('conta nova: oferece a biometria uma vez', async () => {
      await abrir(null);

      await tocar('Cadastrar');

      expect(Alert.alert).toHaveBeenCalledWith('Entrar com biometria?', expect.any(String), expect.any(Array));
      await responderAlerta('Usar biometria');
      expect(ativarBiometria).toHaveBeenCalledWith('u1');
      expect(Alert.alert).toHaveBeenLastCalledWith('Biometria ativada', expect.any(String));
    });

    it('conta nova: biometria não confirmada', async () => {
      ativarBiometria.mockResolvedValue({ ativada: false, mensagem: 'Não deu.' });
      await abrir(null);

      await tocar('Cadastrar');
      await responderAlerta('Usar biometria');

      expect(Alert.alert).toHaveBeenLastCalledWith('Biometria não ativada', 'Não deu.');
    });

    it('perfil não encontrado: volta ao login com o motivo', async () => {
      firestore.__limpar();

      await abrir();

      expect(signOut).toHaveBeenCalled();
      expect(screen.getByText('Tela Autenticação')).toBeOnTheScreen();
      expect(screen.getByText(/Não encontramos os dados desta conta/)).toBeOnTheScreen();
    });

    it('sem internet: entra com a cópia guardada', async () => {
      await local.gravarLocal('sessao', { uid: 'u1', nome: 'Ana (cópia)', email: 'ana@exemplo.com', grupoId: 'g1' });
      firestore.__falhar('getDoc', { code: 'unavailable' });

      await abrir();

      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
      expect(useCompartilharLocalizacao).toHaveBeenLastCalledWith(expect.objectContaining({ nome: 'Ana (cópia)' }), 'g1');
    });

    it('sem internet e sem cópia: entra sem família', async () => {
      firestore.__falhar('getDoc', { code: 'unavailable' });

      await abrir({ ...ANA, displayName: 'Ana' });

      expect(screen.getByText('Tela Grupo')).toBeOnTheScreen();
    });
  });

  describe('e-mail', () => {
    it('e-mail não confirmado: só abre depois da confirmação', async () => {
      config.auth.currentUser = { ...ANA, emailVerified: false };

      await abrir({ ...ANA, emailVerified: false });
      expect(screen.getByText('Tela VerificarEmail')).toBeOnTheScreen();
      expect(processarFila).not.toHaveBeenCalled();

      await tocar('E-mail confirmado');
      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
    });

    it('sair na confirmação do e-mail', async () => {
      config.auth.currentUser = { ...ANA, emailVerified: false };
      await abrir({ ...ANA, emailVerified: false });

      await tocar('Sair do e-mail');

      expect(signOut).toHaveBeenCalled();
      expect(screen.getByText('Tela Autenticação')).toBeOnTheScreen();
    });
  });

  describe('biometria', () => {
    beforeEach(() => {
      biometriaAtiva.mockResolvedValue(true);
    });

    it('sessão salva com biometria: trava até confirmar', async () => {
      await abrir();

      expect(screen.getByText('Tela Biometria')).toBeOnTheScreen();
      await tocar('Desbloquear');
      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
    });

    it('3 falhas: volta ao login com o motivo', async () => {
      await abrir();

      await tocar('Esgotar tentativas');

      expect(signOut).toHaveBeenCalled();
      expect(apagarSenhaOffline).toHaveBeenCalled();
      expect(screen.getByText('Aviso: 3 falhas.')).toBeOnTheScreen();
    });

    it('voltar do segundo plano depois de 10 s trava de novo', async () => {
      await abrir();
      await tocar('Desbloquear');
      const agora = Date.now();
      const relogio = jest.spyOn(Date, 'now');

      relogio.mockReturnValue(agora);
      await act(() => mudarApp('background'));
      relogio.mockReturnValue(agora + 10000);
      await act(() => mudarApp('active'));

      expect(screen.getByText('Tela Biometria')).toBeOnTheScreen();
    });

    it('saída rápida (diálogo do sistema) não trava', async () => {
      await abrir();
      await tocar('Desbloquear');
      const agora = Date.now();
      const relogio = jest.spyOn(Date, 'now');

      relogio.mockReturnValue(agora);
      await act(() => mudarApp('background'));
      relogio.mockReturnValue(agora + 9999);
      await act(() => mudarApp('active'));

      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
    });
  });

  describe('família', () => {
    it('sem família: tela de grupo, com "Pular"', async () => {
      firestore.__semear('usuarios/u1', { nome: 'Ana', email: 'ana@exemplo.com' });
      await abrir();

      expect(screen.getByText('Tela Grupo')).toBeOnTheScreen();
      await tocar('Pular');
      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
      expect(useCompartilharLocalizacao).toHaveBeenLastCalledWith(expect.anything(), null);
    });

    it('criar a família leva ao Menu com ela', async () => {
      firestore.__semear('usuarios/u1', { nome: 'Ana', email: 'ana@exemplo.com' });
      await abrir();

      await tocar('Criar grupo');

      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
      expect(useCompartilharLocalizacao).toHaveBeenLastCalledWith(expect.anything(), 'g9');
    });

    it('mapa sem família leva para Minha Família', async () => {
      firestore.__semear('usuarios/u1', { nome: 'Ana', email: 'ana@exemplo.com' });
      await abrir();
      await tocar('Pular');

      await tocar('Abrir mapa');
      expect(Alert.alert).toHaveBeenCalledWith('Mapa', expect.any(String), expect.any(Array));

      await responderAlerta('Minha Família');
      expect(screen.getByText('Tela Família')).toBeOnTheScreen();
    });

    it('sair da família volta para a tela de grupo', async () => {
      await abrir();
      await tocar('Abrir família');

      await tocar('Sair da família');

      expect(screen.getByText('Tela Grupo')).toBeOnTheScreen();
    });
  });

  describe('navegação', () => {
    it.each([
      ['Abrir mapa', 'Tela Mapa'],
      ['Abrir família', 'Tela Família'],
      ['Abrir SOS', 'Tela SOS'],
      ['Abrir histórico', 'Tela Histórico'],
      ['Abrir perfil', 'Tela Perfil'],
    ])('%s e volta pelo "‹ Menu"', async (botao, tela) => {
      await abrir();

      await tocar(botao);
      expect(screen.getByText(tela)).toBeOnTheScreen();

      await tocar('‹ Menu');
      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
    });

    it('o voltar do Android volta ao Menu', async () => {
      await abrir();
      await tocar('Abrir SOS');

      await act(() => voltarAndroid());

      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
    });

    it('no Menu o voltar do Android segue o padrão do sistema', async () => {
      await abrir();

      expect(voltarAndroid).toBeNull();
    });

    it('perfil sem endereço não deixa sair e reabre o cadastro', async () => {
      await abrir();
      await tocar('Abrir perfil');
      await tocar('Sem endereço');

      await tocar('‹ Menu');

      expect(screen.getByText('Tela Perfil')).toBeOnTheScreen();
      expect(Alert.alert).toHaveBeenCalledWith('Endereço obrigatório', expect.any(String), expect.any(Array));
      await responderAlerta('Cadastrar');

      await tocar('Com endereço');
      await tocar('‹ Menu');
      expect(screen.getByText('Tela Menu')).toBeOnTheScreen();
    });

    it('câmera em tela cheia esconde o "‹ Menu"', async () => {
      await abrir();
      await tocar('Abrir perfil');

      await tocar('Abrir câmera');

      expect(screen.queryByText('‹ Menu')).toBeNull();
    });
  });

  describe('sair', () => {
    it('apaga as cópias locais e o hash da senha', async () => {
      await abrir();
      await tocar('Abrir perfil');

      await tocar('Sair da conta');

      expect(apagarSenhaOffline).toHaveBeenCalled();
      expect(await local.lerLocal('sessao')).toBeNull();
      expect(screen.getByText('Tela Autenticação')).toBeOnTheScreen();
    });

    it('conta excluída: desliga a biometria e avisa no login', async () => {
      await abrir();
      await tocar('Abrir perfil');

      await tocar('Conta excluída');

      expect(desativarBiometria).toHaveBeenCalledWith('u1');
      expect(screen.getByText('Aviso: Sua conta foi excluída.')).toBeOnTheScreen();
    });
  });

  describe('anúncios (simulados: os testes rodam sem o AdMob nativo, como no Expo Go)', () => {
    it('banner no Menu e no Histórico', async () => {
      await abrir();
      expect(screen.getByTestId('banner-simulado')).toBeOnTheScreen();

      await tocar('Abrir histórico');
      expect(screen.getByTestId('banner-simulado')).toBeOnTheScreen();
    });

    it.each(['Abrir SOS', 'Abrir perfil', 'Abrir mapa', 'Abrir família'])('sem banner em "%s"', async (botao) => {
      await abrir();

      await tocar(botao);

      expect(screen.queryByTestId('banner-simulado')).toBeNull();
    });

    it('banner desligado no console do Firebase: some do Menu', async () => {
      firestore.__semear('configuracoes/anuncios', { banner: false });

      await abrir();

      expect(screen.queryByTestId('banner-simulado')).toBeNull();
    });

    it('o bloco do sistema do aparelho vale', async () => {
      firestore.__semear('configuracoes/anuncios', {
        banner: true,
        android: { anunciosLigados: false },
        ios: { anunciosLigados: false },
      });

      await abrir();

      expect(screen.queryByTestId('banner-simulado')).toBeNull();
    });

    it('sem banner no login', async () => {
      await abrir(null);

      expect(screen.queryByTestId('banner-simulado')).toBeNull();
    });

    it('intersticial ao voltar ao Menu depois de 3 telas', async () => {
      await abrir();

      for (const botao of ['Abrir mapa', 'Abrir família']) {
        await tocar(botao);
        await tocar('‹ Menu');
      }
      expect(screen.queryByRole('button', { name: 'Fechar anúncio' })).toBeNull();

      await tocar('Abrir histórico');
      await tocar('‹ Menu');

      const fechar = screen.getByRole('button', { name: 'Fechar anúncio' });
      expect(fechar).toBeOnTheScreen();
      await fireEvent.press(fechar);
      expect(screen.queryByRole('button', { name: 'Fechar anúncio' })).toBeNull();
    });

    it('nunca ao sair do SOS', async () => {
      await abrir();

      for (const botao of ['Abrir mapa', 'Abrir família', 'Abrir SOS']) {
        await tocar(botao);
        await tocar('‹ Menu');
      }

      expect(screen.queryByRole('button', { name: 'Fechar anúncio' })).toBeNull();
    });
  });

  it('nome alterado no perfil chega ao compartilhamento da localização', async () => {
    await abrir();
    await tocar('Abrir perfil');

    await tocar('Mudar nome');

    expect(useCompartilharLocalizacao).toHaveBeenLastCalledWith(expect.objectContaining({ nome: 'Ana Lima' }), 'g1');
  });
});
