/*
 * Regras da biometria: ver se o aparelho tem, pedir a verificação,
 * classificar o resultado e contar as falhas (na entrada e na senha do
 * SOS).
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/*
 * Entrar com biometria é OPCIONAL: uma trava LOCAL sobre a sessão do
 * Firebase Authentication (que continua sendo a autenticação).
 *
 * A pessoa escolhe usar depois de criar a conta (App) ou em
 * Configurações → Segurança. Ligada, a biometria é pedida ao abrir o
 * app com a sessão salva e ao voltar do segundo plano; o login por
 * e-mail e senha não pede. Depois de 3 falhas a sessão é encerrada e
 * é preciso entrar com e-mail e senha.
 *
 * No aparelho ficam só a escolha e o contador de falhas (SecureStore).
 * Senha e dados biométricos nunca são guardados: quem confere a
 * biometria é o sistema operacional e quem confere a senha é o Firebase.
 */

export const MAXIMO_FALHAS = 3;

// Chaves do SecureStore aceitam apenas letras, números, ".", "-" e "_".
const chaveFalhas = (uid) => `conecta.biometria.falhas.${uid}`;
const chaveAtiva = (uid) => `conecta.biometria.ativa.${uid}`;

// A pessoa escolheu entrar com biometria neste aparelho?
export async function biometriaAtiva(uid) {
  try {
    return (await SecureStore.getItemAsync(chaveAtiva(uid))) === '1';
  } catch (erro) {
    console.log('Escolha da biometria não lida:', erro.message);
    return false;
  }
}

export async function desativarBiometria(uid) {
  await SecureStore.deleteItemAsync(chaveAtiva(uid));
}

/*
 * Liga a biometria depois de confirmá-la uma vez (garante que o
 * aparelho tem e que a pessoa consegue usar antes de travar o app).
 * Devolve { ativada, mensagem }; a mensagem explica quando não ligou.
 */
export async function ativarBiometria(uid) {
  if (!(await biometriaDisponivel())) {
    return {
      ativada: false,
      mensagem: 'Este aparelho não tem biometria cadastrada. Cadastre seu rosto ou digital nas configurações do aparelho e tente de novo em Meu Perfil → Configurações → Segurança.',
    };
  }

  const resultado = await autenticarComBiometria('Ativar a biometria');

  if (resultado !== 'sucesso') {
    return {
      ativada: false,
      mensagem: 'A biometria não foi confirmada. Você pode ativar depois em Meu Perfil → Configurações → Segurança.',
    };
  }

  await SecureStore.setItemAsync(chaveAtiva(uid), '1');
  await zerarFalhas(uid).catch(() => {});

  return { ativada: true, mensagem: '' };
}

// Tem sensor e há biometria cadastrada no sistema?
export async function biometriaDisponivel() {
  try {
    const [temSensor, cadastrada] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);

    return temSensor && cadastrada;
  } catch (erro) {
    console.log('Não foi possível verificar a biometria:', erro);
    return false;
  }
}

// Só para os textos da tela: o app não escolhe o tipo de biometria.
// No iPhone é o Face ID; no Android quem decide é o sistema.
export async function temReconhecimentoFacial() {
  try {
    const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync();

    return tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  } catch (erro) {
    console.log('Não foi possível verificar o reconhecimento facial:', erro);
    return false;
  }
}

export async function lerFalhas(uid) {
  const valor = Number.parseInt(await SecureStore.getItemAsync(chaveFalhas(uid)), 10);

  return Number.isInteger(valor) && valor > 0 ? valor : 0;
}

// O contador fica no aparelho: fechar e abrir o app não o zera.
export async function registrarFalha(uid) {
  const total = (await lerFalhas(uid)) + 1;

  await SecureStore.setItemAsync(chaveFalhas(uid), String(total));

  return total;
}

export async function zerarFalhas(uid) {
  await SecureStore.deleteItemAsync(chaveFalhas(uid));
}

/*
 * Senha errada ao encerrar o SOS (Segurança): mesmo limite do login.
 * Ao atingir MAXIMO_FALHAS a sessão é encerrada (o SOS continua
 * ativo). Fica no aparelho: sair da tela não zera o contador.
 */
const chaveFalhasSenhaSOS = (uid) => `conecta.sos.senha.falhas.${uid}`;

export async function registrarFalhaSenhaSOS(uid) {
  const atual = Number.parseInt(await SecureStore.getItemAsync(chaveFalhasSenhaSOS(uid)), 10);
  const total = (Number.isInteger(atual) && atual > 0 ? atual : 0) + 1;

  await SecureStore.setItemAsync(chaveFalhasSenhaSOS(uid), String(total));

  return total;
}

export async function zerarFalhasSenhaSOS(uid) {
  await SecureStore.deleteItemAsync(chaveFalhasSenhaSOS(uid));
}

/*
 * Resultado de authenticateAsync →
 *   sucesso | falha | cancelado | bloqueado | indisponivel
 *   | nao_configurado
 */
export function classificarResultado(resultado) {
  if (resultado?.success) return 'sucesso';

  switch (resultado?.error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
    // Não há alternativa à biometria: "usar senha" é só um cancelamento.
    case 'user_fallback':
      return 'cancelado';
    case 'lockout':
      return 'bloqueado';
    case 'not_enrolled':
    case 'not_available':
    case 'passcode_not_set':
      return 'indisponivel';
    case 'missing_usage_description':
      // iPhone com Face ID sem a permissão NSFaceIDUsageDescription no app.
      return 'nao_configurado';
    default:
      // authentication_failed e erros inesperados contam como falha.
      return 'falha';
  }
}

/*
 * Decide o próximo passo da tela de bloqueio.
 * falhas: total já registrado ANTES desta tentativa.
 *   entrar   → biometria confirmada
 *   tentar   → continua na tela de bloqueio (mostra a mensagem)
 *   encerrar → encerra a sessão; só entra de novo com e-mail e senha
 */
export function proximoPasso(classificacao, falhas) {
  switch (classificacao) {
    case 'sucesso':
      return { acao: 'entrar', falhas: 0 };
    case 'falha': {
      const total = falhas + 1;

      if (total >= MAXIMO_FALHAS) {
        return {
          acao: 'encerrar',
          falhas: total,
          mensagem: 'Não foi possível confirmar sua identidade pela biometria. Entre com seu e-mail e senha.',
        };
      }

      return {
        acao: 'tentar',
        falhas: total,
        mensagem: `Não reconhecemos você (tentativa ${total} de ${MAXIMO_FALHAS}).`,
      };
    }
    case 'cancelado':
      return {
        acao: 'tentar',
        falhas,
        mensagem: 'Verificação cancelada. Para entrar no Conecta, confirme sua identidade.',
      };
    case 'bloqueado':
      return {
        acao: 'tentar',
        falhas,
        mensagem: 'A biometria foi bloqueada pelo sistema após várias tentativas. Desbloqueie o aparelho com a senha dele e tente novamente.',
      };
    case 'nao_configurado':
      return {
        acao: 'tentar',
        falhas,
        mensagem: 'O Face ID não está liberado nesta versão do app.',
      };
    default:
      return {
        acao: 'tentar',
        falhas,
        mensagem: 'A biometria não está disponível neste aparelho. Cadastre seu rosto ou digital nas configurações do aparelho, ou toque em "Sair da conta" e entre com e-mail e senha.',
      };
  }
}

export async function autenticarComBiometria(mensagem = 'Entrar no Conecta') {
  const opcoes = {
    promptMessage: mensagem,
    promptSubtitle: 'Confirme que é você',
    cancelLabel: 'Cancelar',
    // Sem alternativa: nem o PIN do aparelho nem o botão "usar senha".
    disableDeviceFallback: true,
    fallbackLabel: '',
    // Aceita o desbloqueio facial por câmera, comum no Android.
    biometricsSecurityLevel: 'weak',
  };

  try {
    let resultado = await LocalAuthentication.authenticateAsync(opcoes);

    // Expo Go no iPhone não tem a permissão do Face ID e o sistema nem
    // abre a biometria. Só em desenvolvimento, usa o código do aparelho
    // para os testes não travarem (no app gerado o Face ID é exigido).
    if (__DEV__ && resultado?.error === 'missing_usage_description') {
      resultado = await LocalAuthentication.authenticateAsync({
        ...opcoes,
        disableDeviceFallback: false,
        fallbackLabel: undefined,
      });
    }

    return classificarResultado(resultado);
  } catch (erro) {
    console.log('Biometria indisponível:', erro);
    return 'indisponivel';
  }
}
