# Runbook — Embedded Signup Meta (WhatsApp Business)

Este runbook documenta os passos obrigatorios para habilitar o fluxo de
Embedded Signup no painel Meta for Developers e vincular o Nexus Roteador
Webhook.

## Pre-requisitos

- Conta Business Manager (BM) ativa.
- Acesso de administrador em https://developers.facebook.com.
- Dominio `roteadorwebhook.nexusai360.com` com HTTPS funcional.
- Variaveis de ambiente em `.env.production`:
  - `META_APP_ID`
  - `META_APP_SECRET`
  - `META_EMBEDDED_SIGNUP_CONFIG_ID`

## Passos

1. **Criar App Meta**
   - Acesse https://developers.facebook.com → **Create App**.
   - Escolha tipo **Business** → nomeie e associe ao Business Manager.

2. **Adicionar produto Facebook Login for Business**
   - No painel do app → **Add Product** → **Facebook Login for Business** → Setup.

3. **Adicionar produto WhatsApp**
   - **Add Product** → **WhatsApp** → **Get Started**.
   - Vincule uma WABA de teste (obrigatorio em modo dev).

4. **Copiar credenciais do App**
   - **App Settings → Basic** → copie **App ID** e **App Secret**.
   - Atualize `.env.production`:
     ```
     META_APP_ID=xxxxxxxxxxxx
     META_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     ```

5. **Criar Configuration do Facebook Login for Business**
   - **Facebook Login for Business → Configurations → Create**.
   - Tipo: **WhatsApp Embedded Signup**.
   - Permissoes exigidas:
     - `whatsapp_business_management`
     - `whatsapp_business_messaging`
     - `business_management`
   - Salve e copie o **Config ID** gerado.
   - Atualize `.env.production`:
     ```
     META_EMBEDDED_SIGNUP_CONFIG_ID=xxxxxxxxxxxxxxxx
     ```

6. **Cadastrar App Domains**
   - **App Settings → Basic → App Domains** → adicionar:
     - `roteadorwebhook.nexusai360.com`

7. **Configurar Valid OAuth Redirect URIs**
   - **Facebook Login for Business → Settings → Valid OAuth Redirect URIs**.
   - Incluir:
     - `https://roteadorwebhook.nexusai360.com/api/meta/oauth/callback`

8. **Habilitar teste ou producao**
   - **Modo dev**: adicionar Test Users em **App Roles → Test Users**.
   - **Modo prod**: concluir **Business Verification** (pode demorar dias).

9. **App Review**
   - Submeter as permissoes `whatsapp_business_management`,
     `whatsapp_business_messaging` e `business_management` para review Meta.
   - Apos aprovacao, o botao "Conectar WhatsApp com Facebook" funciona para
     qualquer usuario externo.

## Nota sobre Tokens

O Embedded Signup cuida automaticamente da geracao do **Token de Acesso** com
os escopos corretos (`whatsapp_business_management`, `whatsapp_business_messaging`,
`business_management`) e persiste como `accessToken` na credencial da empresa.
Nao e necessario criar manualmente um System User Token no Business Settings
da Meta — o backend usa o proprio `accessToken` para todas as chamadas Graph
API (inclusive `subscribed_apps` para inscricao do webhook).

Para **configuracao manual** (empresas sem Embedded Signup), informe o mesmo
Token de Acesso no campo `accessToken` — ele precisa possuir os escopos
`whatsapp_business_management` + `whatsapp_business_messaging` para que a
inscricao automatica do webhook e o teste de conexao funcionem.

## Validacao

Apos configurar:

1. Reinicie o container da aplicacao para carregar as novas envs.
2. Acesse **Empresa → WhatsApp Cloud** com usuario super admin ou company_admin.
3. Clique em **Conectar WhatsApp com Facebook**.
4. Conclua o popup → confirme:
   - Campos `metaAppId`, `phoneNumberId`, `wabaId`, `accessToken` preenchidos.
   - Painel **Inscricao Meta** reporta status `active`.
   - Logs exibem `subscribeWebhook` com sucesso.

## Troubleshooting

- **"Embedded Signup nao configurado"**: envs ausentes ou container nao
  reiniciado.
- **Popup fecha sem retorno**: confirmar `Valid OAuth Redirect URIs` e App
  Domains. Verificar se o modo dev exige Test User.
- **"Dados Meta nao chegaram"**: bloqueio de `window.postMessage` por
  extensao/adblock. Testar em aba anonima limpa.
- **`validateBusinessAccess` falha**: token sem permissao na WABA. Confirmar
  escopos do Configuration e vincular WABA ao BM correto.

## Rotacao de tokens

Tokens longos (60 dias) sao persistidos em `Credential.accessTokenExpiresAt`.
A rotacao automatica (refresh pre-expiracao + job BullMQ) esta no backlog.
Ate la, reexecute o Embedded Signup antes da expiracao quando necessario.
