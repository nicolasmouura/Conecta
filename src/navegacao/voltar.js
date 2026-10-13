import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/*
 * Botão "voltar" do Android (físico ou gesto) na navegação por estado
 * do app (não há biblioteca de navegação).
 *
 * Enquanto "ativo", o voltar do Android chama onVoltar e não fecha o
 * app. O BackHandler chama primeiro o último registrado: cada subtela
 * se registra ao abrir, então o voltar sempre fecha o nível mais
 * interno. Modais tratam o voltar pelo próprio onRequestClose.
 *
 * onVoltar pode não fazer nada (ex.: salvando): o voltar é consumido
 * mesmo assim, para não fechar o app no meio de uma operação.
 * No iOS não há botão voltar: o hook não faz nada.
 */
export function useVoltarAndroid(ativo, onVoltar) {
  // Sempre a versão mais recente de onVoltar, sem registrar de novo.
  const onVoltarRef = useRef(onVoltar);

  useEffect(() => {
    onVoltarRef.current = onVoltar;
  });

  useEffect(() => {
    if (!ativo) return undefined;

    const assinatura = BackHandler.addEventListener('hardwareBackPress', () => {
      onVoltarRef.current?.();
      return true;
    });

    return () => assinatura.remove();
  }, [ativo]);
}
