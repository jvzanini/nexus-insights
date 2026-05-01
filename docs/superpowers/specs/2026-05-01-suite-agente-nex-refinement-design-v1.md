# Spec — Suite Agente Nex · Refinamento (v0.16.0)
**Versão:** v1 (rascunho inicial — sujeita a 2 pente-finos antes de virar v3 final).
**Data:** 2026-05-01
**Autor:** claude-nex-suite-refinement (sessão Claude Code).

---

## 1. Contexto e motivação

A Suite Agente Nex foi entregue em v0.15.0 com 4 sub-páginas (`/agente-nex/{configuracao,chaves,prompt,consumo}`) e a bolha flutuante com áudio Whisper. Em uso real (Matrix Fitness Group, super_admin João Zanini), ficaram evidentes lacunas de UX, refinamento visual, consistência com as telas de Relatórios e capacidade do prompt do agente. Esta spec consolida 24 alvos de mudança em **uma única release v0.16.0** com workflow rigoroso (double-check spec/plan, subagent-driven-development com TDD, ui-ux-pro-max em toda UI, deploy assistido).

**Objetivo de negócio:** entregar a Suite Agente Nex em estado "ferramenta poderosa que dá orgulho usar" — visualmente coesa com Relatórios, prompt blindado contra desvios de identidade, base de conhecimento extensível por URL, drill-down de custo com cotação/spread visíveis, calendário global consistente com convenção segunda-domingo.

---

## 2. Escopo (alto nível)

| Bloco | O que muda | Trigger |
|-------|------------|---------|
| A. Tela "Chaves de API" | Layout fullbleed, botão "Nova" padronizado, AlertDialog em vez de window.confirm, atalho "Criar API key no provedor" no card vazio | Print: card aparenta submenu, botão desalinhado, popup nativo do browser |
| B. Tela "Configuração" | Mais respiro, modelo customizado inline (sem campo separado), 4º tier "premium" (azul→amarelo→laranja→vermelho), catálogo expandido (~120-150 modelos OpenRouter+DeepSeek+open source) | Print: campo "Modelo customizado" duplica feedback abaixo do select; só 3 tiers; catálogo OpenRouter incompleto |
| C. Tela "Prompt" | Prompt baseline visível em campo dedicado, override avançado renomeado e melhor explicado, playground vira <Sheet> lateral em formato chat, IDENTITY_BASE atualizado (Nexus Chat / Insights, sem menção a "ChatGPT"), guardrails default robustos, KB aceita URL além de PDF/TXT | Print: tela compacta, override pouco claro, playground inline pouco útil, prompt atual invisível |
| D. Tela "Consumo" | Botões padronizados com Conversas, KPIs com 4 casas decimais e cards uniformes, ícone de chamadas trocado, gráficos com R$ no eixo Y + 2 casas + fonte maior + datas formatadas, pizza com tooltip lateral, tabela "Histórico de chamadas" com filtros + linha total + drill-down (cotação, spread, valor referência) | Múltiplos prints |
| E. Calendar global | weekStartsOn=1 (segunda) e showOutsideDays=false em todos os usages | Print: dias 1-2 maio aparecem no calendário de abril selecionados; semana começa domingo |
| F. URLs por conta Chatwoot | Configurações ganha card mapeando `account_id → URL pública`. Agente Nex usa pra montar deep-links | Pedido explícito do usuário |
| G. Doc / memory / deploy | Bump 0.15.4 → 0.16.0, CHANGELOG/STATUS/runbook/memória, migration Prisma manual, gh run watch + /api/health | Workflow padrão |

---

## 3. Requisitos detalhados

### 3.A · Tela "Chaves de API" (`/agente-nex/chaves`)

**A1. Tela em variante fullbleed**
- `PageShell variant="narrow"` → `variant="wide"`. Cards de provedor passam a ocupar toda a largura, com max-width interno 1280px.
- Justificativa: print mostra que o card ocupa um quadrado central pequeno, parecendo submenu. Telas de Relatórios usam `wide` e a tela "Chaves" deve seguir o mesmo padrão.

**A2. Cabeçalho de provedor padronizado**
- Cada bloco de provedor (OpenAI, Anthropic, Google Gemini, OpenRouter) ganha:
  - Header visual com ícone do provedor (logo ou letra estilizada em círculo violeta) + label (typography idêntica ao header de Relatórios) + ações alinhadas à direita.
  - Botão "+ Nova" passa a ter `variant="default"` (gradient violet) com ícone Plus + label, altura 40px, alinhado à direita do header em flex justify-between.
  - Atalho "Criar API key" com `<ExternalLink>` ícone + label, abre `provider.apiKeyUrl` em nova aba, alinhado à esquerda do header (antes do título do provedor) ou no card vazio quando "Nenhuma chave cadastrada".

**A3. Substituir `window.confirm` por `<AlertDialog>`**
- `LlmCredentialsManager` (e `KbSection` por consistência) trocam o `window.confirm("Excluir chave 'Teste'? Essa ação não pode ser desfeita.")` por:
  ```tsx
  <AlertDialog>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Excluir chave "{name}"?</AlertDialogTitle>
        <AlertDialogDescription>
          Essa ação remove permanentemente a credencial e não pode ser desfeita.
          Configurações que usavam essa chave precisarão ser refeitas.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction variant="destructive">Excluir</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  ```
- `src/components/ui/alert-dialog.tsx` já existe — não é necessário criar.

**A4. Card "Nenhuma chave cadastrada" amigável**
- Quando provider tem 0 credenciais: card mostra ícone (KeyRound), texto "Nenhuma chave cadastrada para {Provider}" e CTA secundário "Criar API key no painel do {Provider}" (link `<a>` com `<ExternalLink>` ícone) + CTA primário "+ Nova chave".

**Edge cases:**
- Tema escuro/claro: AlertDialog deve respeitar tokens.
- Botão Excluir deve ser disabled enquanto a action roda (loading state com Loader2).
- Após exclusão, toast de sucesso e router.refresh().

---

### 3.B · Tela "Configuração do Agente Nex" (`/agente-nex/configuracao`)

**B1. Mais respiro vertical**
- Aumentar `space-y-6` → `space-y-8` no container principal.
- Card root: padding interno maior (`p-6` → `p-8`), border-radius padronizado.
- Sections (Toggle Nex / Status / Form Provider+Model / Chave / Spread / Ações) ganham separadores visuais sutis (border-t).

**B2. Modelo customizado inline (sem campo separado)**
- Hoje: ao escolher "Outro (digitar manualmente)" no `<SearchableSelect>`, o componente renderiza um `<Input>` separado abaixo do select — duplica feedback e "fica feio" (palavra do usuário).
- Novo: substituir o `<SearchableSelect>` por um componente híbrido `<ModelInputCombobox>` que, ao selecionar "Outro", transforma o trigger num `<Input editable>` com placeholder "ex: gpt-5.5-2026-04-15" e botão "voltar para lista" no canto. O usuário digita no mesmo lugar.
- Implementação: usar base-ui Combobox (`@base-ui/react/combobox`) ou estender `SearchableSelect` com prop `customMode`. Decisão técnica: estender `SearchableSelect` é menor mudança.

**B3. 4 tiers de classificação de custo**
- Hoje: `tier: "free" | "low" | "medium" | "high"` (3 efetivos — `free` é caso edge).
- Novo: `tier: "low" | "medium" | "high" | "premium"` com cores:
  - `low` → azul (~$0–1/M output) — `bg-blue-500/15 text-blue-500 border-blue-500/30`
  - `medium` → amarelo ($1–$10/M) — atual amber
  - `high` → laranja ($10–$30/M) — `bg-orange-500/15 text-orange-500 border-orange-500/30`
  - `premium` → vermelho (>$30/M) — atual destructive (red)
- `<TierBadge>` ganha 4 variantes correspondentes. Rótulo: `$`, `$$`, `$$$`, `$$$$`.
- Reclassificar todos os ~70 modelos no catálogo conforme nova faixa (gpt-5.5-pro vai pra premium, opus 4.7 pra premium, etc.).
- Tier `free` continua como conceito mas mapeia visualmente pra `low` (azul) com nota "free" no badge.

**B4. Catálogo OpenRouter expandido (~120-150 modelos)**
- Adicionar (lista mínima a confirmar via WebFetch openrouter.ai/api/v1/models):
  - DeepSeek: `deepseek/deepseek-r1-0528`, `deepseek/deepseek-v3-0324`, `deepseek/deepseek-coder-v2`.
  - Qwen: `qwen/qwen-2.5-coder-32b-instruct`, `qwen/qwen-3-235b`, `qwen/qwq-32b-preview`.
  - Llama: `meta-llama/llama-3.3-70b-instruct:free` (já existe), `meta-llama/llama-4-scout`, `meta-llama/llama-4-maverick`.
  - Mistral: `mistralai/codestral-2501`, `mistralai/pixtral-12b`, `mistralai/mistral-medium`.
  - Cohere: `cohere/command-r-08-2024`, `cohere/command-r7b-12-2024`.
  - xAI: `x-ai/grok-2-1212`, `x-ai/grok-3` (se publicado).
  - Yi/Phi/Liquid: `01-ai/yi-large`, `microsoft/phi-4`, `liquid/lfm-40b`.
  - Perplexity: `perplexity/sonar-pro`, `perplexity/sonar-reasoning`.
  - Reka, Inflection, Nous, Hermes, MythoMax, Solar — incluir os 5 mais populares.
- Tarefa concreta: o catálogo final é produto do agent OpenRouter (rodando em background). Spec aceita lista canônica como **anexo dinâmico** — o plan trata da fonte de verdade.
- IDs sempre no formato `provider/model-name` (convenção OpenRouter); manter `provider` raiz `openrouter` na config.

**Edge cases:**
- Modelo customizado: continuar suportando snapshots datados (`-2024-08-06`).
- Reclassificação de tier: rodar testes existentes de pricing (`pricing.test.ts`) pra confirmar que nenhum modelo conhecido vira "—" no `calculateCost`.

---

### 3.C · Tela "Prompt do Agente Nex" (`/agente-nex/prompt`)

**C1. Campo "Prompt baseline" sempre visível**
- Hoje: o usuário só vê o prompt composto via Dialog "Pré-visualizar prompt completo".
- Novo: dedicar um card no topo da tela (acima de "Comportamento") chamado **"Prompt completo (preview)"** com `<pre>` somente-leitura mostrando o resultado de `composeSystemPrompt(currentConfig, kbDocs)`.
  - Atualiza em tempo real (debounced 400ms) conforme o usuário edita personalidade/tom/guardrails/override.
  - Ações: "Copiar", "Maximizar" (abre Sheet em tela cheia).
  - Mostra também IDENTITY_BASE em destaque (collapsed por default, "Mostrar identidade fixa" toggle).

**C2. Renomear e explicar "Modo override avançado"**
- Hoje: rótulo confuso ("Modo override avançado · Substitui o prompt composto por um texto bruto. Use apenas se você sabe exatamente o que está fazendo.").
- Novo: renomear pra **"Modo prompt manual"** com tooltip `(?)` que explica em pt-BR claro:
  > "Substitui completamente o prompt composto (identidade + personalidade + tom + guardrails + base de conhecimento) por um texto livre que você escreve. Use só se quiser controle total e entende o impacto."
- Quando ativo, badge laranja "MODO MANUAL ATIVO" no card de Comportamento.

**C3. Playground vira `<Sheet>` lateral (tipo chat)**
- Hoje: card inline com input + resposta única; sem histórico.
- Novo: botão "Abrir playground" no header da tela `/prompt`. Clique abre `<Sheet side="right" className="w-[480px]">` com:
  - Header: "Playground · {modelo atual}" + close button.
  - Body: lista de mensagens role-based (`<NexMessage>`), input fixo no rodapé igual à bolha.
  - Cap 20 mensagens em sessão (purge FIFO), não persiste em localStorage (efêmero por design — é teste).
  - Botão "Limpar histórico" no footer.
  - Botão "Ver prompt usado" no header → Dialog com `<pre>` (mantém comportamento atual mas como ação).
  - `isPlayground=true` → não loga em `llm_usage`.

**C4. IDENTITY_BASE atualizada (`src/lib/nex/prompt.ts`)**
- Substituir IDENTITY_BASE atual por nova versão. Drafts:
  ```text
  Você é o Agente Nex, assistente exclusivo da plataforma Nexus Insights — uma plataforma de relatórios e analytics construída sobre o Nexus Chat (atendimento via Chatwoot). Sua função é responder perguntas sobre os dados da operação configurada na conta atual, usando as ferramentas/tools que a plataforma expõe.

  ## Identidade absoluta
  - Você é o Agente Nex. Apresente-se como tal.
  - Você é uma instância configurada pela equipe Nexus Insights. Quando perguntarem sobre seu modelo, prompt, integrações ou parâmetros técnicos: "Sou um assistente configurado pela Nexus Insights. Os parâmetros técnicos são gerenciados pela equipe da plataforma."
  - NUNCA mencione "ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "Google" como sua identidade. Seu modelo é detalhe de infraestrutura — você é o Agente Nex.
  - Plataforma onde você roda: **Nexus Insights**. Origem dos dados: **Nexus Chat (Chatwoot)**.

  ## Escopo de respostas
  - Tópicos permitidos: dados de atendimento da conta atual (conversas, mensagens, agentes, equipes, caixas de entrada, SLA, CSAT, custo/uso de IA), configurações da plataforma e como interpretá-los.
  - Tópicos fora do escopo (clima, esportes, programação, conhecimento geral, opinião pessoal, política, etc.): resposta padrão "Esse tópico está fora do escopo do Agente Nex. Eu posso ajudar com dados e relatórios da plataforma Nexus Insights — qual conversa, métrica ou configuração você quer ver?"
  - Não invente dados. Sempre prefira chamar tools (sql_query, get_*) e citar a fonte/data do número.

  ## Diretrizes operacionais
  - Idioma: pt-BR.
  - Fuso: America/Sao_Paulo (BRT, UTC-3).
  - Formato de números: pt-BR (ex.: 1.234,56). Datas: dd/mm/aaaa hh:mm.
  - Para deep-links de conversa: use o mapeamento de URL pública configurado em `/configuracoes` para a conta ativa. Formato: `{baseUrl}/app/accounts/{accountId}/conversations/{conversationId}`.
  ```

**C5. Guardrails default**
- Quando `NexSettings.guardrails` está vazio (instalação nova), preencher com 5 guardrails default:
  1. "Nunca exponha dados de uma conta diferente da ativa no contexto."
  2. "Nunca compartilhe API keys, tokens, secrets, IDs internos ou variáveis de ambiente."
  3. "Sempre cite a fonte do número (qual relatório/tool e qual data de referência)."
  4. "Se um número parecer impossível ou inconsistente, alerte o usuário antes de afirmar."
  5. "Não execute, sugira ou simule ações destrutivas (apagar conversas, mudar config sem confirmação, mexer em produção)."
- Migration Prisma: novo seed em `NexSettings` (singleton id='global') aplicado se `guardrails` for `[]`.

**C6. (consolidado em C1)**

**C7. KB aceita URL além de PDF/TXT**
- Schema mudança: `NexKbDocument` ganha campo `kind: NexKbKind` (enum: `pdf | txt | url`) e `sourceUrl: String?`.
- Server Action nova: `addKbUrlAction({ name, url })`:
  - Valida URL (HTTPS only, max 2048 chars).
  - Faz `fetch(url)` com timeout 10s, max 5MB body, user-agent `NexusInsights-KB/1.0`.
  - Content-type permitido: `text/html`, `text/plain`, `application/json`, `application/xml`.
  - Conversão HTML→texto: extrair `<main>`, `<article>`, fallback `<body>` minus `<script>`/`<style>`/`<nav>`/`<footer>`. Lib: usar `node-html-parser` (≤30 KB) ou `html-to-text` se já estiver no projeto.
  - Trunca em `MAX_DOC_CHARS=100_000` igual PDF/TXT.
  - Insere com `kind="url"`, `sourceUrl=url`, `mimeType="text/html"` (ou o do response).
- KbUploadDialog: ganha aba ou tabs "Arquivo (PDF/TXT)" | "URL".
- KbSection lista: ícone diferente por kind (FileText pra PDF/TXT, Link pra URL); URL clicável com tooltip mostrando domínio.
- Re-fetch manual: botão "Atualizar conteúdo" em URLs (refaz fetch, atualiza extractedText e charCount).

**C8. URL Chatwoot API como KB sugerida**
- Adicionar **botão de atalho** no KbSection: "Adicionar API Chatwoot (sugerida)" → preenche dialog com URL `https://www.chatwoot.com/developers/api/` e nome "Chatwoot API Reference".
- Sugestão é informativa — usuário ainda confirma adição.

**C9. URLs públicas Chatwoot por conta (em /configuracoes)**
- Schema novo: `model ChatwootAccountUrl` com:
  ```prisma
  model ChatwootAccountUrl {
    accountId Int      @id @map("account_id")
    publicUrl String   @map("public_url")
    label     String?  // opcional, ex.: "Matrix Fitness"
    updatedAt DateTime @updatedAt @map("updated_at")
    updatedById String? @db.Uuid @map("updated_by_id")
    @@map("chatwoot_account_urls")
  }
  ```
- Tela `/configuracoes` ganha card novo **"URLs Públicas Chatwoot"** (super_admin only):
  - Lista todas as `accountId` distintas da `chatwoot_facts_meta` (ou da config do leitor read-only) e exibe input editável por linha.
  - Salva via Server Action `setChatwootAccountUrlAction({ accountId, publicUrl, label? })` com validação (HTTPS, max 512 chars).
  - Card explica: "Usado pelo Agente Nex para gerar links clicáveis das conversas em respostas."
- Agente Nex: `composeSystemPrompt` injeta seção `## URLs públicas` listando contas + URL configurada quando há contas mapeadas.
- Tool nova `get_conversation_link(accountId, conversationId)` ou helper interno em `runNexAgent` que monta o link concatenando `${publicUrl}/app/accounts/${accountId}/conversations/${conversationId}` com o `publicUrl` salvo.

**Edge cases:**
- Conta sem URL configurada: agente usa fallback `https://app.chatwoot.com/...` e avisa "URL pública não configurada para esta conta — defina em /configuracoes".
- Override avançado preenchido: `composeSystemPrompt` ainda injeta URL pública? **Decisão:** Não. Override é absoluto. Documentar.
- KB URL refetch automático: NÃO. Refetch é manual (decisão deliberada — evita custo/latência inesperado).

---

### 3.D · Tela "Consumo do Agente Nex" (`/agente-nex/consumo`)

**D1. Botões padronizados**
- Pills de período (Hoje / 7 dias / 30 dias / 90 dias / Tudo / Personalizado) hoje têm altura/padding diferentes da `<PeriodPills>` usada em Conversas.
- Novo: refatorar `consumo-content.tsx` para usar o **mesmo componente** `<PeriodPills>` de `src/components/reports/period-pills.tsx` (já reutilizável). Se o shape de período não bate, criar um adapter local.
- Botões secundários ("Atualizado agora mesmo", refresh, exportar) seguem o mesmo size do header de Conversas.

**D2 + D3. Calendar global**
- `src/components/ui/calendar.tsx` ganha defaults novos:
  - `weekStartsOn: 1` (segunda-feira) — passar via `locale={ptBR}` ou prop direto.
  - `showOutsideDays: false` — esconder dias do mês anterior/próximo no grid (visual: célula vazia).
- Aplicar em todos os usages: `consumo-content.tsx`, `period-pills.tsx`, qualquer outro Calendar mode="range".
- Confirmar via test: gerar mês de maio/2026 com mode="range" 01-31 e checar que abril não mostra dias 1-2 selecionados.

**D4. KPI cards uniformes**
- Hoje: Card "Custo total" parece maior que os 3 outros (Total chamadas / Tokens input / Tokens output).
- Novo: `<KpiCard>` ganha prop `equalSize` ou simplesmente forçar `min-h-[120px]` em todos os 4. Grid `grid-cols-4 gap-4` (ou `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`).
- Custo total mostra valor primário em BRL (4 casas) e linha secundária USD (4 casas) — não deve estourar verticalmente.

**D5. Ícone do "Total de chamadas"**
- Hoje: `PhoneCall` (parece chamada telefônica).
- Novo: `Activity` (ondinha de pulso) ou `Zap` (raio); decisão na implementação via ui-ux-pro-max — proposta principal: **`Activity`**.

**D6. KPIs custo: 4 casas decimais com half-up**
- Função `formatBrl4(v)` e `formatUsd4(v)` arredondam pra 4 casas (round half up) e exibem com `Intl.NumberFormat({minimumFractionDigits:4, maximumFractionDigits:4})`.
- Aplica somente nos KPI cards e no centro do donut. Tabela detalhada permanece bruto (D18).

**D7. Gráfico "Custo por dia"**
- Eixo Y: prefixo `R$` antes do valor (`R$ 0,00`), 2 casas decimais, fonte 12 → 13px.
- Eixo X: datas no formato `30/ABR` (curto, uppercase com `.replace(".", "")`), fonte 12 → 13px, padding-top `8` → `12` (espaçamento entre eixo X e linha do gráfico).
- Tooltip: continua mostrando "01 de mai · Custo (R$) R$ 0,200923" mas reduz casas decimais pra 4.
- Componente: `<InteractiveAreaChart>` em `src/components/charts/area-chart.tsx`. Mudanças localizadas via prop `yAxisFormat="brl-2"` ou nova prop `currencySymbol="R$"`.

**D8. Gráfico "Custo por modelo"**
- Mesmas mudanças do D7 no eixo Y.
- Eixo X (rótulos dos modelos): fonte 12 → 13px, padding-top `8` → `12`. Se modelo tem nome longo, truncate em 24 chars com `...`.
- Tooltip: 4 casas decimais.

**D9. PieChart "Distribuição por provider"**
- Tooltip atualmente cobre o donut e o valor central.
- Novo: tooltip posicionado fora do donut (`coordinate={{ x: chartWidth - tooltipWidth, y: 16 }}` ou usando `position={{ x: 'right', y: 0 }}`). Implementação concreta: usar `position={{ x: 8, y: 8 }}` (top-left fixo do container do gráfico).
- Tooltip ganha quebra de linha entre nome e valor: `OpenAI` em uma linha, `R$ 0,2334 (100%)` em outra. Reduz largura.
- Múltiplos providers: legend abaixo do donut com cor + label + percentual; tooltip no hover destaca a fatia.

**D10. Centro do donut: 4 casas**
- Texto central "R$ 0,233454" → "R$ 0,2335" (4 casas).

**D11. Renomear "Chamadas detalhadas"**
- Para **"Histórico de chamadas"** (mais compreensível em pt-BR, sem ambiguidade de "chamada telefônica").
- Header da tabela: ícone `History` (lucide) + título.

**D12. Paginação repensada**
- Hoje: paginação no rodapé com indicador "Página 1 de N · 68 itens".
- Novo: footer sticky com:
  - Esquerda: "Mostrando 1-25 de 68".
  - Direita: ChevronLeft + page selector (input numérico 1-N) + ChevronRight + dropdown "25 / 50 / 100 por página".
- Loading state durante mudança de página: tabela mantém altura, overlay com spinner.

**D13. Drill-down de linha (DrillDownSheet)**
- Click em uma linha → abre `<Sheet side="right">` com detalhamento da chamada:
  - **Identificação**: ID, data/hora (BRT), userId, provider, model.
  - **Tokens & duração**: tokens entrada, tokens saída, prompt chars, response chars, duration (ms→s→min com `formatDuration`).
  - **Custo USD bruto**: valor exato como veio da API (sem round adicional).
  - **Cotação aplicada**: USD/BRL no momento da chamada (campo `usdToBrlRate`), com data/hora de quando a cotação foi obtida (se disponível — caso contrário "snapshot da chamada").
  - **Spread cartão**: valor em vigor no momento (precisamos persistir ou inferir — ver edge case).
  - **Cálculo final**: `Custo BRL = costUsd × usdToBrlRate × (1 + spread)`. **Atenção:** revisar como o spread é aplicado hoje em `usage-logger`.
  - **Erro** (se houver): mensagem.
  - Botão "Copiar JSON da chamada" (para suporte).
- Componente: usar `<DrillDownSheet>` existente como base ou criar novo `<UsageDetailSheet>`.

**D14. Whisper sem tokens (esperado)**
- Whisper cobra por minuto, não por token. UI deve:
  - Mostrar "—" nas colunas tokens entrada/saída para `model="whisper-1"` (já é o que `formatTokens(0)` produz, mas indistinguível de "0 tokens").
  - Adicionar tooltip ou nota: "Whisper (transcrição de áudio) é cobrado por minuto. Tokens não se aplicam."
  - Investigar discrepância reportada (painel OpenAI mostra X tokens, sistema mostra Y) — provavelmente o painel da OpenAI conta os tokens emitidos pelo modelo subsequente que processou a transcrição. Plan inclui task de auditoria/checagem.

**D15. Renomear colunas tabela**
- "Tokens in" → "Tokens de entrada".
- "Tokens out" → "Tokens de saída".
- Headers `<th>` ganham `aria-label` correspondente.

**D16. Filtros tabela**
- Novo: 2 selects acima da tabela (alinhados à direita):
  - "Todos os providers" (default) | OpenAI | Anthropic | Gemini | OpenRouter.
  - "Todos os modelos" (default) | lista de modelos distintos no período corrente (calculada server-side e injetada no client).
- Filtros aplicam-se à query da tabela (parâmetro adicional em `getUsageDetails`).
- Preservar filtros na URL (`?provider=openai&model=gpt-5.5`) para shareable.

**D17. Linha de total na tabela**
- Acima da tabela (sticky no scroll horizontal), exibir uma "row" especial com totals do filtro corrente:
  - Custo USD total (bruto, sum sem round).
  - Custo BRL total.
  - Tokens entrada total, tokens saída total.
  - Duração total formatada (`formatDuration` que converte ms → s → min → h).
  - Número de chamadas no filtro.
- Visual: row com `bg-muted/40` e `font-semibold`. Label primeira coluna: "Total no filtro".

**D18. Tabela: USD/BRL bruto (sem 4-casa round)**
- Colunas "Custo USD" e "Custo BRL" usam o valor exato como veio do banco/API (Decimal 10,6 / 12,6). Formato:
  - USD: `$0.000034` (até 6 casas decimais, formato en-US).
  - BRL: `R$ 0,000123` (até 6 casas, pt-BR).
- Mantém `Intl.NumberFormat` com `minimumFractionDigits=2, maximumFractionDigits=6`.

**Edge cases:**
- Tabela vazia: empty state com ícone + "Nenhuma chamada no período."
- Filtro com 0 resultados: mantém empty state.
- Duração total com 0 chamadas: "0s".
- BRL/USD podem vir null em chamadas antigas (antes de `cost_brl` ser calculado): mostrar "—".
- Se `usdToBrlRate` é null no drill-down: indicar "Cotação não armazenada (chamada anterior à v0.10)".

---

### 3.E · Calendar global (consolidado em D2-D3)
- Aplicado a todos os Calendar usages: consumo, period-pills, qualquer outro DateRange.
- Test: snapshot do mês maio/2026 com seleção 01-31 confirma que abril/2026 não mostra dias 1-2 selecionados nem 28-30 do mês anterior são exibidos.

---

### 3.F · URLs por conta (consolidado em C9)

---

### 3.G · Doc / memory / deploy
- Bump `package.json` 0.15.4 → 0.16.0.
- `CHANGELOG.md` entrada nova com bullets de cada bloco (A-F).
- `docs/STATUS.md` atualizado com release notes v0.16.0.
- `design-system/nexus-insights/MASTER.md` (se aplicável): atualizar exemplos de TierBadge, KpiCard, Calendar.
- `docs/runbooks/` novos:
  - `agente-nex-prompt.md` (como configurar prompt, KB, override, playground).
  - `consumo-drill-down.md` (como interpretar cotação/spread no detail).
- Memory global (em `~/.claude/projects/.../memory/`): novo `project_v0.16_release.md` resumindo o pacote.
- Migration Prisma: aplicada manualmente em produção pelo super_admin (instruções no runbook).
- Deploy: `git push origin main` → GitHub Actions build → Portainer redeploy → `gh run watch <id>` → verificar `/api/health` retorna `version=v0.16.0` e `status=ok`.

---

## 4. Arquitetura técnica

### 4.1 Componentes novos
- `src/components/agente-nex/model-input-combobox.tsx` (B2).
- `src/components/agente-nex/playground-sheet.tsx` (C3).
- `src/components/agente-nex/prompt-preview-card.tsx` (C1).
- `src/components/agente-nex/kb-url-form.tsx` (C7).
- `src/components/llm/usage-detail-sheet.tsx` (D13).
- `src/components/llm/usage-table-filters.tsx` (D16).
- `src/components/llm/usage-table-totals-row.tsx` (D17).
- `src/components/settings/chatwoot-urls-card.tsx` (C9).

### 4.2 Componentes alterados
- `src/components/ui/calendar.tsx` (E1, E2).
- `src/components/llm/tier-badge.tsx` (B3 — 4 variantes).
- `src/components/charts/area-chart.tsx`, `bar-chart.tsx`, `donut-with-center.tsx` (D7-D10).
- `src/components/agente-nex/llm-config-form.tsx` (B1, B2, B3).
- `src/components/agente-nex/prompt-config-form.tsx` (C2, C5).
- `src/components/agente-nex/kb-section.tsx` (C7, C8).
- `src/components/llm/consumo-content.tsx` (D1, D11, D12, D15, D16, D17, D18).
- `src/app/(protected)/agente-nex/chaves/page.tsx` (A1).
- `src/app/(protected)/agente-nex/configuracao/page.tsx` (B1).
- `src/app/(protected)/agente-nex/prompt/page.tsx` (C1, C3).
- `src/app/(protected)/configuracoes/page.tsx` (C9).
- `src/components/settings/llm-credentials-manager.tsx` (A2, A3, A4).

### 4.3 Schema Prisma (migrations)
- `NexKbDocument`: adiciona `kind: NexKbKind @default(PDF)` (enum: `PDF | TXT | URL`) e `sourceUrl: String?`.
- Novo model `ChatwootAccountUrl` (id `account_id`, `public_url`, `label?`, `updatedAt`, `updatedById?`).
- Migration name: `20260501_v0_16_kb_url_chatwoot_urls`.
- Aplicar manualmente em produção (`prisma migrate deploy`).

### 4.4 Server Actions novas
- `addKbUrlAction({ name, url })` em `src/lib/actions/nex-prompt.ts`.
- `refreshKbUrlAction(docId)` (re-fetch URL existente).
- `setChatwootAccountUrlAction({ accountId, publicUrl, label? })` em `src/lib/actions/settings.ts`.
- `listChatwootAccountUrlsAction()` (load card).

### 4.5 Funções backend
- `src/lib/nex/kb-url.ts` (fetcher + html-to-text + truncate).
- `src/lib/nex/url-mapping.ts` (helper `getPublicUrlForAccount(accountId)`).
- `src/lib/llm/queries/usage-stats.ts`: novo `getUsageDetails` aceita `provider?`, `model?` e retorna `totals: { costUsd, costBrl, tokensInput, tokensOutput, durationMsTotal, count }`.

### 4.6 Catálogo (B4)
- `src/lib/llm/catalog.ts`: substituir array OpenRouter por lista expandida (~120-150). Reclassificar tier em todos providers conforme nova faixa de 4 tiers.
- Adicionar fonte canônica de pricing OpenRouter em `src/lib/llm/pricing.ts` (entrada `MODEL_PRICING` por modelo conhecido).

---

## 5. Riscos e mitigations

| Risco | Mitigation |
|-------|------------|
| Schema migration falha em produção (FK existente) | Migration aditiva (NULL allowed); seed manual com `kind=PDF` para registros existentes |
| Catálogo OpenRouter desatualizado entre v1 e produção | Plan inclui task de WebFetch openrouter.ai/api/v1/models antes do commit final, snapshot timestamp em comentário no catalog.ts |
| Tooltip do PieChart corta em telas pequenas | Test responsivo em viewports 375px / 768px / 1280px |
| KB URL fetch pesado (5MB) bloqueia worker | Cap 5MB hard, timeout 10s, AbortController |
| Whisper discrepância tokens vs OpenAI | Plan inclui task de auditoria — pode ser bug ou diferença de definição |
| Reclassificação de tier muda UX percebida (gpt-5.5 vira premium) | Documentar em CHANGELOG, comunicar via subtítulo de tier |
| Override avançado vs URL pública: comportamento confuso | Documentado em runbook; UI mostra "MODO MANUAL ATIVO" de forma destacada |

---

## 6. Out of scope (v0.16.x não cobre)

- Multi-tenant: hoje as URLs são globais (super_admin only). Futuro: per-tenant.
- KB de site com sitemap crawl: só URL única por documento; crawling automático fica pra v0.17+.
- Histórico do playground: efêmero por design — persistir é v0.17+.
- Métricas de prompt eval: nada de A/B testing automatizado nesta release.
- Catálogo dinâmico (live OpenRouter): nesta release o catálogo é estático no código; live fica pra futuro.
- Whisper cost por minuto detalhado no drill-down: investigação só, sem refactor da pricing.

---

## 7. Critérios de aceite

- [ ] Tela `/agente-nex/chaves` em variante wide com header padronizado e AlertDialog em "Excluir".
- [ ] Tela `/agente-nex/configuracao` com 4 tiers visuais, modelo customizado inline, catálogo expandido (>100 modelos OpenRouter).
- [ ] Tela `/agente-nex/prompt` com prompt baseline visível, override renomeado, playground em Sheet lateral, IDENTITY_BASE atualizado, guardrails default, KB com aba URL, atalho API Chatwoot.
- [ ] Tela `/agente-nex/consumo` com PeriodPills igual Conversas, KPIs uniformes 4 casas, ícone Activity, gráficos com R$ + 2 casas + fonte +1px, pizza tooltip lateral, tabela "Histórico" com filtros + total + drill-down + colunas renomeadas, USD/BRL bruto.
- [ ] `/configuracoes` com card "URLs Públicas Chatwoot" funcional.
- [ ] Calendar global: weekStartsOn=1 e showOutsideDays=false em todos os usages.
- [ ] Migration Prisma aplicada em produção.
- [ ] CHANGELOG/STATUS/runbook/memory atualizados.
- [ ] /api/health mostra `version=v0.16.0` e `status=ok`.
- [ ] Suite de testes: ≥ 90 suites, ≥ 800 testes PASS; typecheck 0 erros.
- [ ] Smoke real: super_admin cadastra chave OpenAI nova → ativa → testa playground → adiciona URL KB → vê drill-down de chamada.

---

## 8. Bibliografia interna

- Print da tela "Chaves de API" (ProgenitureCard) — mostra layout central + popup nativo.
- Print de "Configuração" — mostra modelo customizado duplicado.
- Print da pizza "Distribuição por provider" com tooltip cobrindo gráfico.
- Print do calendário Apr/May 2026 com dia 1-2 maio aparecendo selecionado em abril.
- HISTORY agentes: v0.15.0 (suite original), v0.15.4 (UX bubble audio).
- Release atual: v0.15.4 LIVE.

---

**Fim da v1.** Pronto para pente-fino #1.

---

## Apêndice A — Anexo dinâmico do catálogo OpenRouter (B4)

Confirmado via WebFetch openrouter.ai/api/v1/models em 2026-05-01 (~118 modelos canônicos cobrindo o pedido do usuário). Catálogo será aplicado em `src/lib/llm/catalog.ts → PROVIDER_CATALOG.openrouter.models` e nas reclassificações de tier dos demais providers (OpenAI gpt-5.5/5.5-pro → premium; o3-pro → premium; Anthropic opus 4.7 → premium se ≥ $30/M output; etc.).

---

## Pente-fino #1 — achados (registro do double-check)

Análise crítica da v1. Auto-correção será aplicada na v2.

1. **C9 não declara fonte das accounts.** Schema interno não tem tabela `ChatwootAccount`. Fonte real: `SELECT DISTINCT account_id FROM chatwoot_facts_daily_by_account` ou helper `getAvailableAccounts`. v2 precisa nomear.
2. **C5 risco de ressuscitar guardrails que o usuário deletou.** Default só pode ser injetado UMA VEZ (migration de install ou primeira interação). v2 precisa de lógica explícita.
3. **B2 complexidade técnica subestimada.** Estender `SearchableSelect` para `customMode` editable não é trivial. v2 deve apresentar 2 alternativas e cravar uma.
4. **D9 imprecisão técnica.** Recharts não tem `placement="left"`. Tooltip se posiciona via `position={{ x, y }}` numérico. v2 corrige.
5. **D17 server vs client.** `getUsageDetails` deve retornar `totals` calculados na query (subselect), respeitando filtros. v2 adiciona ao contrato.
6. **D14 Whisper auditoria.** v1 cobre o que mostrar mas não a investigação backend. v2 lista 2 hipóteses + task de plan com SQL específico.
7. **C7 KB URL UX de erro.** v2 enumera (timeout, 4xx, 5xx, mime não permitido, body >5MB, html sem conteúdo) e mensagem por caso.
8. **C3 entry point do playground.** v2: botão "Abrir playground" no header da página `/agente-nex/prompt`.
9. **D4 ambiguidade de altura.** v2: padding uniforme + min-h calculado, ou subtítulo opcional em todos os 4 cards.
10. **A1 reavaliação.** wide pode deixar tela vazia. v2 propõe manter narrow + cards full-width internos por provedor.
11. **C1 latência preview.** Preview server roundtrip a cada keystroke é caro. v2: portar `composeSystemPrompt` para utilitário isomorphic + preview client-side.
12. **F.G migration faltando enum.** v2 declara `enum NexKbKind { PDF TXT URL }` + backfill `kind=PDF` em existentes.
13. **D17 cascade de filtro modelo↔provider.** v2: filtro "Modelo" depende do "Provider" selecionado (ou label `(Provider)` em cada modelo).
14. **AuditLog não mencionado.** v2: requisito explícito de `setting_updated` audit em cada server action de mutação.
15. **Acessibilidade.** v2: NFR de keyboard nav, focus trap, esc fecha Sheet/AlertDialog.
16. **Performance.** Catálogo 118 modelos = scroll grande. v2: confirmar virtualization ou fallback.
17. **Reclassificação de tier quebra testes.** v2: critério de aceite explícito.
18. **Spread cartão no drill-down.** Plan task 1 = auditar como spread é aplicado hoje em `usage-logger`. v2 documenta dependência.
19. **Override vazio inválido.** v2: validação client+server "Modo manual ativo precisa de texto não-vazio".
20. **Tema escuro/claro.** v2: NFR global aplicado a todos os componentes novos.
21. **Catálogo validação de IDs.** v2: task de plan = curl smoke em cada novo ID antes de commit final.
22. **Hoje vs Tudo PeriodPills.** v1 fala em adaptar; v2 documenta o adapter ou unifica real.

Total: 22 achados. v2 corrige todos.
