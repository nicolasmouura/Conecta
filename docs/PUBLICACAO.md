# Publicar o Conecta na Play Store e na App Store

O projeto já está configurado para as lojas: identificador `br.com.conecta.app`,
só celular, permissões com o motivo de cada uma, ícones no formato das lojas,
tela de abertura e perfis de build (`eas.json`). O que falta abaixo depende de
contas e acessos que só você tem. Faça na ordem.

---

## 1. Contas (uma vez)

| Onde | Custo | Observação |
|---|---|---|
| [Expo (EAS)](https://expo.dev/signup) | grátis (com limite de builds por mês) | faz os builds na nuvem |
| [Google Play Console](https://play.google.com/console/signup) | US$ 25, uma vez | conta pessoal nova: veja o passo 7 |
| [Apple Developer Program](https://developer.apple.com/programs/enroll/) | US$ 99 por ano | precisa de Apple ID com verificação em 2 etapas |

## 2. Ligar o projeto ao EAS

```bash
npm install -g eas-cli
eas login
eas init
```

O `eas init` cria o projeto no Expo e mostra um `projectId`. Como o app usa
`app.config.js`, ele pode pedir para você colar esse id em `app.json`, dentro
de `"expo": { "extra": { "eas": { "projectId": "..." } } }`.

## 3. Chaves do Firebase e do Google Maps no build

O `.env.local` não vai para o Git nem para o EAS. **Sem estas variáveis o app
fecha ao abrir.** Envie as do seu `.env.local` para os builds de teste e de
produção:

```bash
eas env:push --environment preview --environment production --path .env.local
```

Confira em expo.dev → seu projeto → Environment variables: as 6
`EXPO_PUBLIC_FIREBASE_*` e a `GOOGLE_MAPS_API_KEY`.

## 4. Firebase (projeto de produção)

1. Publique as regras e os índices que estão no repositório (o histórico de
   outro membro precisa do índice composto):

   ```bash
   npx firebase login
   npx firebase use --add          # escolha o projeto do Conecta
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```

2. Firebase Console → Authentication → Templates: idioma **Português (Brasil)**
   nos e-mails de confirmação e de redefinição de senha.
3. Authentication → Sign-in method: só **E-mail/senha** ligado.

## 5. Testar no celular antes de enviar (obrigatório)

O app só foi testado com Jest e no emulador do Firestore. Gere um build de
teste:

```bash
eas build --platform android --profile preview
```

Instale o APK pelo link e confira, em um aparelho de verdade:

- [ ] Abrir o app **com uma conta que já usava a versão antiga** (continua
      logada; família, perfil e mapa aparecem). É a migração para o SQLite.
- [ ] Cadastro novo → confirmar o e-mail → criar família → convidar e aceitar.
- [ ] Mapa com a sua posição e a da família; cards com bateria, rua e casa.
- [ ] SOS **sem internet** (modo avião): aciona, e chega à família quando a
      internet volta. "Estou bem" também.
- [ ] Encerrar o SOS com biometria e com senha.
- [ ] Foto de perfil pela câmera e pela galeria.
- [ ] Ligar a biometria, sair do app por mais de 10 s e voltar.
- [ ] Excluir conta.

Para iPhone, o build de teste precisa do aparelho cadastrado
(`eas device:create`) ou do TestFlight (passo 8).

## 6. Chave do Google Maps (Android)

Google Cloud Console → APIs e serviços → Credenciais → a chave do Maps →
**Restrições de aplicativo: apps Android**:

- pacote `br.com.conecta.app`
- SHA-1 da chave de upload do EAS (`eas credentials` → Android → production)
- SHA-1 da chave de assinatura do Google Play (Play Console → Integridade do
  app → Assinatura de apps), depois do primeiro envio

Em **Restrições de API**, deixe só *Maps SDK for Android*. No iPhone o mapa é
o da Apple e não usa essa chave.

## 7. Google Play

1. Crie o app (nome **Conecta**, idioma Português (Brasil), app gratuito).
2. Gere e envie o primeiro build:

   ```bash
   eas build --platform android --profile production
   eas submit --platform android --profile production
   ```

   O primeiro `.aab` pode precisar ser enviado à mão no Play Console (Teste
   interno → Criar versão). Depois disso o `eas submit` funciona sozinho.
3. **Conta pessoal criada depois de nov/2023:** antes de publicar, o Google
   exige um **teste fechado com pelo menos 12 testadores por 14 dias
   seguidos**. Comece este passo o quanto antes.
4. Preencha em *Política do app*:
   - Política de privacidade: o link público de `docs/politica-de-privacidade.md`
   - Exclusão de conta: o mesmo link (a seção "Como excluir sua conta")
   - Segurança dos dados: respostas em `docs/textos-das-lojas.md`
   - Classificação do conteúdo, público-alvo (**18+ ou 13+, não infantil**),
     sem anúncios
   - Permissão de localização: só em primeiro plano (não precisa da
     declaração de localização em segundo plano)
5. Página da loja: textos em `docs/textos-das-lojas.md`, ícone 512×512 (use
   `assets/icon.png` reduzido), imagem de destaque 1024×500 e pelo menos 2
   capturas de tela do celular.

## 8. App Store

1. App Store Connect → Meus apps → novo app: iOS, nome **Conecta**, idioma
   Português (Brasil), Bundle ID `br.com.conecta.app`, SKU `conecta`.
2. Build e envio (o EAS cria certificados e perfis sozinho):

   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios --profile production
   ```

   O build aparece no **TestFlight** em alguns minutos: teste nele antes de
   enviar para revisão.
3. Preencha:
   - Privacidade do app: respostas em `docs/textos-das-lojas.md`
   - Link da política de privacidade
   - Capturas de tela do iPhone de 6,9" (1320×2868), pelo menos 3
   - Classificação etária, categoria *Estilo de vida* (ou *Navegação*)
4. **Informações para a revisão (essencial):** crie uma conta de teste **com o
   e-mail já confirmado** e uma família com 2 membros, e informe e-mail e senha
   em *Informações de login*. Sem isso o revisor fica na tela "Confirme seu
   e-mail" e recusa o app. Use as notas de `docs/textos-das-lojas.md`, que
   explicam o CPF, a localização e o SOS.

## 9. Próximas versões

- Aumente `version` em `app.json` (ex.: 1.0.1). O número de build sobe
  sozinho (`autoIncrement` no `eas.json`).
- Rode `npm test` e `npm run test:regras` antes de cada build.
- Se mudar `firestore.rules`, publique de novo (passo 4) **antes** de lançar a
  versão que depende da mudança.
