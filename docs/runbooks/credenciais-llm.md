# Runbook — Credenciais do Agente Nex

> Como criar, rotacionar, deletar credenciais (API keys) e ajustar a cotação
> USD→BRL cartão de crédito.

## Pré-requisitos
- Login com perfil `super_admin`.
- Acesso a `/configuracoes`.

## Criar uma nova chave
1. Em `/configuracoes`, descer até o card **"Chaves de API"**.
2. Na seção do provedor desejado (OpenAI / Anthropic / Gemini / OpenRouter), clicar em **"+ Nova"**.
3. Preencher *Label* (opcional — autogera "Chave 1") e a *API key*.
4. Clicar **"Salvar"**. A chave fica disponível imediatamente para selecionar no card "Agente Nex" acima.

## Trocar a chave em uso
1. Card **"Agente Nex"** (acima do card "Chaves de API"), no select **"Chave"**, selecionar outra chave já cadastrada do mesmo provedor.
2. (Opcional) Clicar **"Testar conexão"** para validar o par credencial × modelo.
3. Clicar **"Salvar configuração"**.

## Rotacionar uma chave (mesmo label, chave nova)
1. Card **"Chaves de API"**, na linha da credencial: clicar **"Trocar"**.
2. (Opcional) Clicar **"Testar"** com a nova chave preenchida — valida antes de gravar.
3. Colar a nova API key e clicar **"Salvar"**. Label e ID são preservados; o Agente Nex passa a usar a chave nova automaticamente se aquela já era a ativa.

## Renomear
1. Card **"Chaves de API"**, **"Renomear"** → editar label inline → **"Salvar"**.

## Deletar
1. Card **"Chaves de API"**, ícone 🗑.
2. Confirmar.

> Se a chave estiver em uso pelo Agente Nex, o sistema bloqueia o delete com a mensagem _"Esta chave está em uso pelo Agente Nex. Selecione outra antes de deletar."_ — basta trocar a credencial ativa pelo card "Agente Nex" antes.

## Ajustar spread do cartão de crédito
- Card **"Agente Nex"**, campo **"Spread cartão"** (default 1.10).
- Faixa válida: 1.00 (sem spread) a 1.30 (alto). Tipicamente:
  - Nubank/Inter: ~1.04–1.06
  - Bradesco/Itaú: ~1.10–1.12
  - C6: ~1.07
- Editar o valor, sair do campo (`Tab`/click). Salva automaticamente (debounce 500ms). A cotação efetiva (commercial × spread) é registrada em **cada nova chamada** do Agente Nex em `llm_usage.usd_to_brl_rate`.

## Falha de cotação (raro)
- Se a AwesomeAPI estiver fora: o sistema usa o cache de até 4h ou fallback fixo 5.50. Logs em `console.warn("[exchange-rate] ...")`.
- Para forçar refetch: editar o spread e salvar — invalida o cache em memória.

## Migração legacy
- Quando o deploy v0.12.0 sobe pela primeira vez, `ensureLlmTables` migra automaticamente a configuração antiga em `llm_configs.encrypted_api_key` para `llm_credentials` com label "Chave principal". Nada manual.
- Se uma chave antiga estava corrompida e o `decrypt` falhou, o log mostra _"[ensureLlmTables] decrypt falhou na config X; pulando."_ — basta cadastrar a chave novamente pelo card "Chaves de API".
