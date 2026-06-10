# Changelog

## [v0.56.2] 2026-06-10 — Dashboard/relatórios sempre no ar (resiliência a falha de conexão)

Corrige a tela **"too many connections for role chatwoot_leitura"** que aparecia no Dashboard e relatórios.

- **Causa (medida no banco):** o usuário read-only do Chatwoot tem **limite de 5 conexões** (num servidor que permite 400). Em picos (dashboard atualizando + worker sincronizando + relatórios + vários usuários) passa de 5 e o banco recusa a conexão. Não é vazamento — é capacidade.
- **Resiliência (no código, já no ar):** o Dashboard e **todos os relatórios** passam a exibir o **último dado conhecido** quando há um pico, em vez de mostrar erro. Guardamos uma cópia "último dado bom" (válida por 24h) e a servimos automaticamente se o banco recusar a conexão. Self-healing: volta ao dado fresco assim que o banco responde. **Sempre aparecendo.**
- **Capacidade na raiz (ação no banco, complementar):** subir o limite do role para 30 elimina o pico de vez — `ALTER ROLE chatwoot_leitura CONNECTION LIMIT 30;` (rodado pelo admin do banco).

TDD: +6 testes. tsc 0, build 0.

### Reorganização do fluxo de trabalho
- Este projeto passa a trabalhar **sempre direto na `main`** (sessão única, sem worktrees/branches de feature). Regras atualizadas em `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/agents/_README.md`.

---

## [v0.56.1] 2026-06-10 — Correção do crash de login (primeiro acesso / trocar senha)

Corrige a experiência ruim ao logar com um usuário que precisa **trocar a senha no primeiro acesso** (`mustChangePassword`): a tela recarregava vazia, depois mostrava o erro cru "This page couldn't load", e só logava após recarregar manualmente.

- **Causa:** o login mandava para `/dashboard` e o middleware reescrevia (302) para `/perfil/trocar-senha`. Esse redirecionamento **encadeado**, durante a navegação iniciada pelo formulário, o Next não conseguia concluir → tela de erro crua. Quem não precisa trocar senha ia direto ao `/dashboard` (sem o salto) e por isso nunca via o problema.
- **Correção (login):** o login agora **já manda direto** para a tela de trocar senha quando o usuário precisa — sem o salto intermediário. Passa a se comportar como o login normal, que sempre funcionou. A senha **não é tocada** nesse fluxo.
- **Correção (robustez):** o app **nunca tinha uma tela de erro própria**. Adicionamos páginas de erro on-brand (com botão **"Tentar novamente"**) que substituem o overlay cru do Next em qualquer falha momentânea — vale para o login e para todas as telas. Antes, qualquer engasgo virava aquela tela preta assustadora.

TDD: +4 testes. tsc 0, build 0. Sem regressões.

---

## [v0.56.0] 2026-06-10 — Edição de e-mail de usuários + resiliência do carregamento de dados

**Edição de e-mail (gestão de usuários):**
- Quem tem permissão para editar outros usuários agora pode **atualizar o e-mail** no dialog de edição (antes o campo era travado).
- A **senha é mantida** ao trocar o e-mail — só muda se uma nova senha for digitada.
- E-mail normalizado (`trim` + minúsculas) e **checagem de unicidade** (não permite e-mail já usado por outro usuário; manter o próprio e-mail é permitido).
- O campo continua travado para o **proprietário** (imutável) e para o **próprio usuário logado** (que troca o e-mail pela página Perfil, com verificação).

**Resiliência do carregamento ("erro ao carregar as informações"):**
- Corrige o erro **intermitente** que aparecia no Dashboard e nos relatórios que leem o banco do Chatwoot ao vivo.
- **Causa raiz:** o pool por conexão é `max:1` (limite do usuário read-only). O Dashboard dispara ~14 queries simultâneas; quando o pool satura, o tempo de espera por uma conexão estoura com um erro que **não era retentado** e derrubava todas as telas. Além disso, o cache (30s) expirava antes do polling (60s) e, sem *single-flight*, várias requisições batiam o banco ao mesmo tempo.
- **Correção:** o retry agora cobre o timeout de espera por conexão e quedas de socket transitórias; e o cache passou a ter *single-flight* (só 1 requisição busca o banco por vez por chave; as demais aguardam o mesmo resultado).
- TDD: +8 testes. tsc 0. Sem regressões.

---

## [v0.55.4] 2026-06-05 — RBAC: menu/rota "Usuários" restritos a super_admin (temporário)

- **Menu "Usuários" oculto** para admin/manager/viewer — visível apenas para `super_admin` (`nav.ts`, `visibleTo: ["super_admin"]`).
- **Rota `/usuarios` protegida**: não-super_admin é redirecionado para `/dashboard` (antes só `viewer` era barrado).
- Mudança **temporária e reversível** (comentários no código indicam como reabrir para admin/manager).

---

## [v0.55.3] 2026-06-05 — Export XLSX: header de atributo com a chave original

- Os headers de atributos dinâmicos voltam a usar a **chave crua** do Chatwoot, mantendo só o prefixo: `Atributo: status_atendimento`, `Atributo: wpp_id` (em vez do Title Case "Atributo: Status Atendimento"). Mantém consistência com como os atributos aparecem na plataforma.

---

## [v0.55.2] 2026-06-05 — Export XLSX: colunas País/Estado-Cidade + headers legíveis

Ajustes na planilha exportada do Relatório de Conversas (somente no arquivo XLSX; a tela não muda):
- **Novas colunas `País` e `Estado/Cidade`** (do contato), logo após `Documento`.
- Coluna `Estado` (que sempre foi o nome da inbox) **renomeada para `Caixa de entrada`** — só na planilha.
- **Headers de atributos dinâmicos** passam de `Atr: wpp_id` para `Atributo: Wpp Id` (prefixo `Atributo:` + nome legível, sem underline, Title Case).

---

## [v0.55.1] 2026-06-05 — Conversas: integração completa de País/Estado-Cidade (contador, chips, export)

Correção da v0.55.0: os filtros País e Estado/Cidade existiam mas não estavam integrados em todos os consumidores do `FilterState`.

- **Badge contador "Filtros"** agora soma `countries`/`estados` (antes ignorava — mostrava 22 em vez de 24).
- **Chips de filtros ativos** na toolbar passam a exibir `País` e `Estado/Cidade` (com popover "+N" e remoção via X).
- **Exportar XLSX** agora aplica os filtros de país/estado (antes exportava ignorando-os) — `matchLocation` no pipeline de `conversas-export.ts`, props propagadas até a server action.
- **Reset "Filtros somente"** (chip X) zera `countries`/`estados`.
- Testes: +8 (chips país/estado, export filtrando por país e por estado).

---

## [v0.55.0] 2026-06-05 — Conversas: País e Estado/Cidade do contato (drilldown + filtros)

### Relatório de Conversas — País e Estado/Cidade
- **Drilldown** ganha duas linhas novas após `ATRIBUTOS`: **`PAÍS`** e **`ESTADO/CIDADE`**, lidas de `contacts.additional_attributes` (`country`/`city`) do Chatwoot. Contato sem dado mostra `—`.
- **Filtros novos** `País` e `Estado/Cidade` (multi-select) no modal de filtros, em ambos os modos **Simples** e **Avançado**, logo após `Documento`.

### Normalização canônica (`src/lib/reports/location.ts`)
- Fonte única da verdade para padronizar os valores sujos do banco. **País**: `Brazil`/variações → `Brasil`. **Estado**: sempre `UF-Nome` (ex.: `MG-Minas Gerais`), por precedência nome → sigla UF → cidade conhecida (capitais + frequentes) → fallback `ZZ-Outros Estados`.
- Match de nome de estado com **fronteira de palavra** (evita falsos-positivos tipo `Paratinga`→Pará). 37+ casos cobertos por testes.

### Arquitetura
- Filtro 100% **client-side** no pipeline da tabela (`matchLocation`, após `documentTypes` e antes do modo Avançado) — sem tocar SQL/WHERE. Normalização aplicada uma vez no mapping de `conversas-list.ts` → `ConversaRow.contact.{country,estado}`.
- Opções dos filtros **derivadas das linhas carregadas**; valores selecionados fora do período atual são preservados (visíveis e desmarcáveis).
- Spec/plano: `docs/superpowers/specs/2026-06-05-conversas-pais-estado-cidade-design.md`, `docs/superpowers/plans/2026-06-05-conversas-pais-estado-cidade.md`.

---

## [v0.54.0] 2026-05-08 — Dashboard: Em atendimento, donut Total, auto-reload, cards menores

### Dashboard — Nomenclatura "Em atendimento"
- **"Abertas" → "Em atendimento"** em todo o dashboard: legenda do gráfico de linhas, KPI card label, DrillDown title/subtitle e título da seção de lista. O status interno (código 0 = open) não foi alterado.

### Dashboard — OpenDrillDown donut
- **Centro do donut exibe "Total"** (soma de abertas + pendentes) em vez de duas linhas separadas ("69 Abertas / 5 Pendentes"). Hover nos slices continua mostrando o breakdown individual.

### Dashboard — Auto-reload em dado desatualizado
- **Banner de stale removido**: ao detectar falha de fetch com dados existentes, a página recarrega automaticamente via `window.location.reload()` sem exibir paths de server action ao usuário.

### Dashboard — KpiClickableCard reduzido
- Padding `p-5 → p-4`, min-height `8rem → 6rem`, valor `text-3xl → text-2xl`, ícone `h-9/w-9 → h-8/w-8` — cards menos volumosos na grade.
- "ver detalhes" com espaçamento `mt-1 → mt-3` para separar melhor do ícone.

### Dashboard — Status no feminino
- `STATUS_LABELS` em `dashboard-data.ts` e `STATUS_LABEL` em `drill-down-contents.tsx`: Aberto→Aberta, Resolvido→Resolvida, Adiado→Adiada (Pendente permanece). Union type TypeScript atualizado.

---

## [v0.53.0] 2026-05-07 — Agente Nex: semântica de período, label exact-match, unanswered status=0

### Agente Nex — Semântica de período corrigida
- **`periodCol` padrão trocado para `last_activity_at`** em `query_conversations` e `aggregate_conversations`. Antes, queries sem `status` usavam `created_at` (novas conversas), o que fazia "quantas conversas hoje?" retornar ~5 em vez de ~32. Agora retorna conversas com atividade no período.
- **Novo parâmetro `received_metric`** (boolean, padrão `false`): quando `true`, usa `created_at` — exclusivo para a métrica "Recebidas/Novas". IDENTITY_BASE atualizado para orientar o agente.
- **`group_by=day/hour`** em `aggregate_conversations` também usa `last_activity_at` por padrão (idem `received_metric` controla). Distribuição por dia/hora agora reflete atividade, não criação.

### Agente Nex — Label exact-match
- **Matching por fronteira de vírgula**: de `cached_label_list ILIKE '%emp%'` para `(',' || cached_label_list || ',') ILIKE '%,emp,%'`. Elimina falsos positivos: `emp` não casa mais com `template`, `empreendimento`, etc.
- Tool definition `label_name` atualizada para deixar claro que é nome EXATO (nome curto).

### Agente Nex — `unanswered_only` força `status=0`
- Quando `unanswered_only=true` sem status explícito, o executor agora injeta `c.status = 0` automaticamente. Antes contava conversas resolvidas/pendentes sem resposta, inflando o resultado.

### IDENTITY_BASE
- Semântica de período reescrita: "conversas hoje" = `last_activity_at`; "novas/recebidas" = `received_metric=true`.
- Guia "sem resposta" reforçado: snapshot atual, não combinar com period.

---

## [v0.52.0] 2026-05-06 — Consumo: gráficos full-period, spinner fix, minDate; Agente Nex: CPF, etiquetas, out-of-scope

### Página de Consumo — Gráficos
- **Full-period em todos os gráficos navegáveis**: "Hoje" gera 24 buckets horários (00:00–23:00); "Esta semana" e "Este mês" geram todos os dias do período. Buckets futuros têm `Custo: null` + `isFuture: true` — sem linha, sem tooltip, sem fill.
- **Sem flash de tela em branco**: `isLoading` inicializa `true` — o skeleton aparece imediatamente sem a passagem rápida pela empty state.
- **Spinner corrigido**: `isChartLoading` agora é resetado para `false` quando `chartReferenceDate` fica `null` (ao trocar a pill com navegação ativa) — spinner não fica preso.
- **Labels do eixo X a cada 2 horas** no modo horário (`xAxisInterval={1}`): exibe "00", "02", "04"…"22" sem sobreposição.
- **`minDate` no `PeriodNavigator`**: seta esquerda desabilitada quando `range.start <= minDate`. A página de consumo passa `minDate` da primeira chamada — bloqueia navegação para antes de abril/2026.

### `InteractiveAreaChart` — API
- `xAxisInterval?: number | "preserveStart" | …` — controle do intervalo de labels do eixo X.
- `AreaChartData` aceita `null` e `boolean` (para `isFuture`) como valores de série.
- `connectNulls={false}` hardcoded em `<Area>` — nunca conecta gaps.
- Tooltip suprimido em pontos `isFuture`.

### Agente Nex — Prompt
- **Out-of-scope em 1ª pessoa**: trocado "Esse tópico está fora do escopo do Agente Nex." → "Desculpe, esse tema está fora do meu escopo de atuação."
- **Mapeamento obrigatório de etiquetas**: linha explícita que "empreendimento" → `emp`; "academia residencial" → `hg`; "academia comercial" → `acd` — evita passar nome longo para `label_name`.
- **Busca por CPF/identificador**: `query_contacts` agora também pesquisa `co.identifier` (campo Chatwoot para CPF e IDs externos) via ILIKE. Resultado inclui o campo `identifier`. Tool description e executor atualizados.
- **Nota sobre atributos personalizados**: guia informa que campos customizados de conversa/contato não são pesquisáveis diretamente — evita alucinação.

---

## [v0.51.0] 2026-05-06 — Dashboard: retry pool, stale banner, polling wired, gráfico período completo

### Confiabilidade — conexões PG
- **Retry com backoff em `queryNexusChat`**: erros transitórios de conexão (`53300 too_many_connections`, `08006`, `08001`, `08P01`, `53200`) são retentados até 3x com delays 200ms/400ms antes de lançar. Elimina o "Não foi possível carregar o dashboard" causado por pico momentâneo de conexões.
- **Banner âmbar não-destrutivo**: quando um re-poll falha mas já há dados carregados, o dashboard exibe um banner de aviso discreto ("Atualização temporariamente indisponível") sem apagar os dados — experiência degradada mas funcional em vez de tela em branco.

### Polling configurável
- **Intervalo lido de settings**: `dashboard/page.tsx` lê `polling.live_seconds` (default 30s, mín 5s, máx 300s) e `polling.refresh_button_enabled` de `getAllSettings()` e passa para `DashboardContent`. O hardcode `POLL_INTERVAL = 60_000` foi removido.
- **Botão refresh condicional**: `DashboardFilters` só renderiza o botão de refresh se `showRefreshButton=true` — controlado pelo setting.

### Configurações — seção Atualização
- **Controles obsoletos removidos**: `historicalSeconds` (era `polling.historical_seconds`) e `sseEnabled` (era `realtime.sse_enabled`) removidos do `PollingSettingsForm` e da página — nenhum dos dois era lido em lugar algum. Formulário agora mostra apenas os 2 controles que realmente funcionam.
- **Textos atualizados**: labels e helpers explicam claramente o que cada setting faz no dashboard.

### Gráfico de período completo
- **Eixo X completo**: `buildFullPeriodRows()` (exportada) constrói o array completo do período — buckets passados com valores acumulados, buckets futuros com `isFuture=true` e séries `null`. O gráfico mostra todas as 24h (modo dia) ou todos os dias (semana/mês); a linha se encerra no presente.
- **Sem linha nos buckets futuros**: `connectNulls={false}` em cada `<Line>` — Recharts não conecta pontos nulos.
- **Sem tooltip nos buckets futuros**: `CustomTooltip` retorna `null` quando `isFuture` é truthy.
- **Aplicado nos drill-downs**: `ReceivedLineChart` e `ResolvedLineChart` dentro dos drill-downs de Novas/Resolvidas usam o mesmo padrão.

---

## [v0.50.x] 2026-05-06 — Agente Nex: calibração automática com 46 cenários reais (100%)

### Sistema de auto-calibração
- **Endpoint `/api/nex/calibrate`**: POST interno autenticado por hash do NEXTAUTH_SECRET. Chama `runNexAgent` com `accountId=9` (Matrix) e `debugMode=true` — retorna `toolCallsLog` + `systemPrompt`.
- **`runNexAgent` debug mode**: nova flag `debugMode` retorna `toolCallsLog[]` (tool, args, resultado) e `systemPrompt` composto para análise externa.
- **`scripts/calibrate-nex.mjs`**: 46 cenários em 11 categorias. Loop iterativo: avalia → analisa → patches automáticos no IDENTITY_BASE → repete. Score: **82.6% → 100%** em 4 rounds contra produção real.

### IDENTITY_BASE calibrado
- **Siglas de estado**: mapeamento explícito SP→"São Paulo", MG→"Minas Gerais", RS→"Rio Grande do Sul", etc. para `inbox_name`.
- **"tempo" desambiguado**: "Como está o tempo em X?" = fora do escopo (clima). "Tempo de resposta" = métrica de atendimento.
- **Identidade reforçada**: não mencionar ChatGPT/Claude/etc. nem para negar. Exemplo: ❌ "Não sou o ChatGPT" → ✅ "Sou o Agente Nex."
- **Chatwoot proibido em todas as formas**: parênteses, casual, técnica, informal.
- **Resolvidas por período**: guia explícito `query_conversations status=1 + period correto`.
- **Distribuição por inbox**: `aggregate_conversations group_by=inbox`.

---

## [v0.49.0] 2026-05-06 — Agente Nex: auto-calibração de prompt + filtro por etiqueta + sugestões max 3

### Agente Nex — Melhorias de prompt e inteligência
- **IDENTITY_BASE reescrito**: guia completo de seleção de ferramenta (qual tool usar para cada tipo de pergunta), mapeamento do negócio Matrix (inboxes=estados, departamentos, etiquetas), semântica explícita de período (`created_at` vs `last_activity_at`), regra clara sobre get_dashboard_summary (em_aberto/pendentes = snapshot total, não filtrado por período), formato de resposta (max 5 itens em listas, converter segundos).
- **Filtro por etiqueta (label_name)**: `query_conversations` agora aceita `label_name` — busca ILIKE em `cached_label_list`. Permite perguntas como "conversas com etiqueta 'falhou'" ou "quantas têm label emp".
- **`avg_reply_time`** adicionada como opção de `agg` em `aggregate_conversations` — usa `reporting_events.name = 'reply_time'` (tempo médio de todas as respostas, não só a primeira).
- **Sugestões max 3** (era 4): `MAX_SUGGESTIONS` reduzido de 4 para 3; `MAX_SUGGESTION_LEN` de 80 para 60 chars. Prompt de sugestões reescrito com exemplo explícito de formato, regra de máximo 3, e instrução de quando NÃO sugerir.
- **Sugestões desabilitadas**: quando `suggestionsEnabled=false`, IDENTITY_BASE instrui explicitamente a não sugerir follow-ups no texto. Quando habilitadas, todas as sugestões são exclusivamente via botões — nunca no texto.
- **Descrições das tools** melhoradas: period = filtra `created_at`, get_dashboard_summary avisa sobre limitação, get_top_agents explica cada metric, aggregate_conversations documenta os dois tipos de agg de tempo.

### Validação
- 21 queries SQL testadas diretamente no banco Chatwoot: grupos de snapshot, período, filtro por estado, etiqueta, atendentes, tempos, semana e isolamento Matrix IA. Todos passaram.
- Script de validação em `scripts/test-nex-queries.mjs`.

---

## [v0.48.1] 2026-05-06 — Corte do gráfico no presente + espaçamento atendentes

### Correções
- **Gráfico truncado no dia/hora atual**: `truncateToNow()` filtra buckets cujo início UTC > now após `toCumulative`. Gráfico semanal/mensal para no dia atual; horário para na hora atual. Buckets futuros não existem no DOM → mouse sobre o espaço futuro não mostra nada.
- **Drill-down charts**: mesma lógica aplicada em `ReceivedLineChart` e `ResolvedLineChart` (Novas/Resolvidas no drill-down).
- **Espaçamento atendentes**: `py-3.5` → `py-5` em `top5-list-card.tsx` — bolinhas dos atendentes com espaço considerável entre si.

---

## [v0.48.0] 2026-05-05 — UX Chart: Novas, acumulado, Hoje, range correto, badges corretos

### Mudanças
- **"Recebidas" → "Novas"**: série no gráfico, badge da legenda, KPI widget ("Novas conversas"), título do drill-down dialog, seção da tabela no drill-down.
- **Linhas cumulativas (carry-forward)**: `toCumulative()` transforma os buckets em totais progressivos — se hora 7 tem 5 novas e hora 8 tem 0, hora 8 mantém 5. Aplicado ao gráfico principal e aos drill-down charts.
- **Badges corretos via `kpiTotals`**: Novas/Resolvidas = soma de eventos (vindo de `stats.received`/`stats.resolved`); Abertas/Pendentes = snapshot atual do KPI (vindo de `byStatus`), não soma dos buckets.
- **"Dia" → "Hoje"** no seletor de período.
- **Range semana correto**: `range.end` é exclusive (11/05 00:00) → subtrai 1ms → exibe 10/05.
- **Total no header do dialog**: Novas (verde) e Resolvidas (azul) mostram o total via `headerExtra` no `DrillDownDialog`.

---

## [v0.47.0] 2026-05-05 — Open+Pending drill-down, Agent drill-down, UX polish

### Novas funcionalidades
- **`OpenDrillDownContent` refeito**: donut com duas linhas centrais (Abertas / Pendentes), toggle Estado/Departamento/Atendente full-width, paginação. SQL reescrito com status IN (0,2) e 7 queries paralelas.
- **`AgentDrillDownData` + `getAgentDrillDown`**: drill-down por atendente com donut de status, toggle Estado/Departamento e tabela paginada. Acesso a partir de `Top5ListCard` com `onItemClick`.
- **`DonutWithCenter` estendido**: aceita `secondaryValue`/`secondaryLabel` para duas linhas no centro.
- **`Top5ListCard` clicável**: prop `onItemClick(id, name)` — itens viram `<button>` com hover state.
- **Top agents**: SQL mudado de avg first_response → COUNT conversations (LIMIT 10); título "Atendentes com mais conversas".

### UX polish
- Ícones dos dialogs: received=verde, resolved=azul, rate=foreground.
- KPI label font: `text-[13px] font-medium`.
- "Conversas abertas" → "Conversas abertas e pendentes" (KPI + dialog).

### Cache keys
- `dashboard-drill-open-canonical-v0.47` (era v0.42).
- `dashboard-drill-received-canonical-v0.45`, `dashboard-drill-resolved-canonical-v0.45`.

---

## [v0.46.0] 2026-05-05 — Correções visuais e semânticas do dashboard

### Correções
- Correções visuais em `conversations-line-chart.tsx`, `dashboard-content.tsx` e `drill-down-contents.tsx`.
- Ajustes semânticos nos drill-down contents.
- Cache key: `dashboard-drill-down` entries bumped.

---

## [v0.45.0] 2026-05-05 — ReceivedDrillDown: chart + distribuição refatorados

### Mudanças
- `ReceivedDrillDownContent`: gráfico de linha por hora/dia + toggle Estado/Departamento/Atendente (bar chart horizontal).
- `dashboard-drill-down.ts`: `getReceivedDrillDown` e `getResolvedDrillDown` enriquecidos com `byTeam`, `byAssignee`, `granularity`, `tz`, `range`, `chart` para suporte ao novo layout.
- Cache keys: `dashboard-drill-received-canonical-v0.45`, `dashboard-drill-resolved-canonical-v0.45`.

---

## [v0.44.0] 2026-05-05 — Fix bucket formula: timestamp without tz

### Correções
- **Bug crítico no gráfico semanal/mensal**: Chatwoot armazena timestamps como `timestamp without time zone` (UTC). A fórmula anterior `col AT TIME ZONE $4` interpretava UTC como horário local (BRT), resultando em ~87,5% das conversas no bucket errado (KPI=94, gráfico semanal=9 para o mesmo dia).
- **Fix**: `(date_trunc('day', (col AT TIME ZONE 'UTC') AT TIME ZONE $4) AT TIME ZONE $4)` — `AT TIME ZONE 'UTC'` converte corretamente o `timestamp without tz` → `timestamptz` antes da troca de fuso.
- **Badges de total por série**: cada série no gráfico exibe badge com contagem total.
- **PeriodNavigator tema claro**: fix de cor no tema claro.
- Cache key: `dashboard-data-canonical-v0.44`.

---

## [v0.43.0] 2026-05-04 — Correções pós v0.42: gráfico, settings configuráveis, labels

### Correções
- **`sqlChart` resolved no branch correto**: `resolved` agora está no Branch 2 (`last_activity_at`), não no Branch 1 (`created_at`). O gráfico de "Resolvidas" agora mostra quando a conversa teve atividade no período, não quando foi criada. Cache key bumped para `dashboard-data-canonical-v0.43`.
- **`getDashboardSettings()` restaurado para ler DB**: Revertido o lock v0.42 que ignorava `app_settings`. Configurações de `week_starts_on`, `week_mode`, `month_mode` voltam a ser lidas da tabela `app_settings` e afetam globalmente a plataforma.
- **`weekStartsOn` configurável**: `getCanonicalPeriod()` agora aceita `weekStartsOn` como parâmetro (padrão 1). `getDashboardPeriod()` passa o valor lido do banco. Se João alterar início da semana para domingo nas configurações, o dashboard reflete imediatamente.
- **Label limpa**: "Esta semana (Seg–Dom)" → "Esta semana" em `PERIOD_OPTIONS`.
- **Removido `title=` hints** das pills de período no dashboard (eram tooltips com texto técnico desnecessário).

### Testes
- `dashboard-settings.test.ts`: atualizado para verificar leitura real do DB (2 consultas em 2 chamadas, valores persistidos aplicados).
- `dashboard-period.test.ts`: `weekStartsOn=0` agora gera semana dom→sáb corretamente.
- `dashboard-data.test.ts`: cache key atualizada para `canonical-v0.43`.
- Suite completa: 1879/1879 verde.

---

## [v0.42.0] 2026-05-04 — Padrão Canônico de Dados (consistência total entre dashboard e relatórios)

> **Refatoração de semântica.** Unifica a definição de todas as métricas em toda a plataforma (dashboard, 7 relatórios, drill-downs, pré-agregação). Elimina discrepâncias de dados entre telas.

### Glossário canônico (`src/lib/reports/canonical.ts`)
- Nova fonte única da verdade: `PeriodColumn`, constantes `STATUS_*` / `MSG_*`, `buildActivePeriodClause`, `buildCreatedPeriodClause`, `chatwootMatrixIaClause`, `chatwootMatrixIaOnlyClause`, 3 CTEs de mensagens (`buildLastClassificationMsgCte`, `buildLastIncomingPublicMsgCte`, `buildLastOutgoingAnyMsgCte`).

### Definições canônicas fixadas
- **Recebidas**: `c.created_at` ∈ período — única métrica por `created_at`.
- **Abertas/Pendentes/Resolvidas**: `c.last_activity_at` ∈ período — conversa com movimentação no período, filtrada por status.
- **Sem resposta**: `status=0` + última mensagem classificável (`buildLastClassificationMsgCte`) = incoming público.
- **Semana**: sempre segunda → domingo. `weekStartsOn=1` hardcoded. Settings de DB ignorados.
- **Proibido**: `COALESCE(last_activity_at, created_at)` em WHERE — invalida índice Postgres.

### Queries migradas para canonical-v0.42
- `buildBaseFilter` agora aceita `periodColumn: "active" | "created"` (default: `"active"`)
- `dashboard-data.ts`: `sqlResolved` migrado `created_at → last_activity_at`; CTEs canônicas em `sqlNoResponse`
- `dashboard-kpis.ts`: `resolvidasNoPeriodo` usa `periodColumn: "active"`; `mensagensNaoRespondidas` usa CTE canônica
- `dashboard-drill-down.ts`: todos os drill-downs com semântica correta
- `conversas-list.ts`: 3 CTEs canônicas; `waiting_seconds`/`open_seconds` com timestamps corretos
- `mensagens-nao-respondidas.ts`: CTE canônica; filtro de período unificado
- `status-distribution.ts`, `por-departamento.ts`, `por-estado.ts`, `ranking-atendentes.ts`: cache keys v0.42
- `home-summary.ts`, `leads-recebidos.ts`: cache keys v0.42; `leads-recebidos` usa `created_at` em ambos os `buildBaseFilter` (principal + comparação)
- `matrix-ia.ts`: `sqlSemResposta` migrado de `EXISTS` aninhado para CTE canônica
- `tempos-resposta.ts`: cache key v0.42; `inbox_id <> MATRIX_IA_INBOX_ID` via constante

### Período unificado (`datetime-core.ts`)
- `getCanonicalPeriod()`: nova fonte única para cálculo de período (end-exclusive, weekStartsOn=1 hardcoded)
- `getDashboardPeriod()`: refatorado como wrapper compat; `mode` e `weekStartsOn` ignorados
- `getDashboardSettings()`: retorna sempre defaults canônicos sem consultar DB

### Pré-agregação
- 4 jobs `refresh-by-*` têm `@canonical` documentado: `received=created_at`, `resolved=last_activity_at+status=1`

### UI / Labels
- Dashboard KPIs: "criadas no período", "finalizadas no período", "com atividade no período"
- Period pills: `title=` canônico ("Segunda-feira → Domingo", "Dia 1 → último dia do mês")
- Relatórios: "Esta semana (Seg–Dom)" em `PERIOD_OPTIONS`

### Documentação
- `docs/runbooks/canonical-data-rules.md`: runbook completo com checklist para novas queries
- `CLAUDE.md §11`: regras canônicas para futuras sessões

---

## [v0.41.1] 2026-05-04 — Hotfix usersSync (column u.role does not exist)

> Pós-deploy v0.41.0: aba Saúde mostrou `column u.role does not exist` em todas as runs de `users`. No Chatwoot OSS atual, `role` está em `account_users.role` (não em `users.role`) — um user pode ter roles diferentes em accounts distintas.

- **`src/lib/chatwoot/sync/table-syncs/users.ts`**: SQL trocado de `u.role` → `au.role` (JOIN com `account_users` já existia). Type também ajustado (`role: string | number | null` em vez de `number`).

## [v0.41.0] 2026-05-04 — Polling Delta + UX Overhaul

> **Pivot arquitetural.** Substitui webhook event-driven (v0.38-v0.40) por **polling delta universal** direto no banco Postgres do Chatwoot. Latência ≤45s p99 (default 30s), zero dependência de cadastro externo de webhook, cobre TODAS as mudanças (não só os ~8 eventos do Chatwoot — pega `inboxes`, `teams`, `users`, `account_users`, `contacts`, `reporting_events`, `taggings` etc). UX inteira de `/bancos-de-dados` reformulada: lista clicável, dialog limpo, wizard sem webhook, abas Conexão/Sincronização/Jobs/Saúde com dados úteis, **tour interativo** em todas as 6 telas.

### Migração arquitetural — webhook → polling delta
- **`src/lib/chatwoot/sync/`** (novo): `cursor.ts` (get/upsert/advance/recordError) + `types.ts` (TableSyncResult, SyncRunSummary, TableSync interface) + `table-syncs/` (10 tabelas: `conversations`, `messages`, `inboxes`, `teams`, `team_members`, `users`, `account_users`, `contacts`, `reporting_events`, `taggings`) + `run-delta-sync.ts` (orquestrador 1 conn × 10 tables × N accounts com probe early-abort + check `deletedAt` + isolamento de erro por table) + `run-full-sweep.ts` (DELETE handling v1: detecta órfãos sem deletar).
- **`src/worker/jobs/chatwoot-sync/`** (novo): `delta-sync.ts` (processor BullMQ, audit sample 1/100 success / 100% fail), `full-sweep.ts` (processor cron diário 03:00 BRT), `scheduler.ts` (tick 5s enfileira por connection com jobId determinístico bucket-based para idempotência), `queues.ts`.
- **`src/worker/index.ts`**: TZ explícito `America/Sao_Paulo`. 4 workers novos: delta-sync (concurrency 4), tick scheduler (queue separada `chatwoot-sync-delta-tick`, concurrency 1), cron dispatcher (queue `chatwoot-sync-sweep-cron`, pattern `0 3 * * *`, tz `America/Sao_Paulo`), sweep filhos (queue `chatwoot-sync-sweep`, concurrency 1).
- **Integração com pré-agregação:** `runDeltaSync` enfileira `refresh-by-account/inbox/agent/team/hourly` jobs ao detectar mudança em vez de publicar `facts:refreshed` direto. Cron antigo de pré-agregação rebaixado de **5min → 30min** como fallback.

### Schema (Prisma)
- **ADD** `polling_interval_seconds INT DEFAULT 30 CHECK >= 20` + `last_sync_at TIMESTAMP NULL` em `nexus_chat_connections`.
- **CREATE TABLE** `chatwoot_sync_cursors` (cursor por `(connection × account × tableName)` com `last_synced_at`/`last_synced_id`/`rows_synced`/`last_run_ms`/`last_error`/`last_error_at`).
- **DROP** `webhook_token`, `webhook_secret_enc`, `last_webhook_at` de `nexus_chat_connections`.
- **ALTER TYPE AuditAction**: remove 6 valores `webhook_*`, adiciona 5 `polling_*` (`polling_sync_completed`, `polling_sync_failed`, `polling_full_sweep_started`, `polling_full_sweep_completed`, `polling_interval_updated`). Cleanup batch dos audit_logs órfãos antes do drop.

### Server Actions (super_admin)
- **`updateConnectionPollingInterval(id, intervalSeconds)`** com validação Zod min 20s max 86400s + audit `polling_interval_updated` (before/after).
- **`createNexusChatConnection`/`updateNexusChatConnection`**: `pollingIntervalSeconds` no `ConnectionInputSchema`. Removida `regenerateConnectionWebhookToken` e geração de `webhookToken`.
- **`listRecentSyncRuns(connectionId, limit)`** (substitui `listRecentWebhookEvents`): cap LIMIT 500, filtra 5 actions `polling_*`.
- **`getConnectionHealthSnapshot`** refator: `lastSyncAt` + `lastSyncLagMinutes` + `syncRunsLast24h` (× 100 sample-corrected) + `syncErrorsLast24h` + `jobErrorsLast24h`.

### UX overhaul `/bancos-de-dados`
- **Lista raiz** (`connection-list.tsx`): linha INTEIRA é `<Link>` clicável (sem botão "Abrir detalhes"). Ícones reformulados: **Activity** (testar — substitui o TestTube odiado), Edit2 (editar), Trash2 (apagar) com `stopPropagation` para não navegar. Tag "X empresas" mantida. Botão "Cadastrar empresa" do header REMOVIDO (agora só dentro de uma conexão).
- **Edit Connection Dialog** (`connection-form-dialog.tsx`): bloco Webhook removido completamente. NOVO campo "Intervalo de sincronização (segundos)" com Input number min=20 step=1, helper text "Mínimo 20 segundos. Padrão 30."
- **Wizard Cadastrar empresa** (`onboarding-wizard.tsx`): Step Webhook removido. Wizard tem 3 steps quando aberto na lista (Conexão → Identidade → Conclusão) ou **2 steps** quando aberto dentro de uma conexão (`prefilledConnectionId` pula Step 1; Identidade → Conclusão).
- **Aba Conexão** (`tabs/conexao-tab.tsx`): mostra `intervalo Ns` no header. Botão "Cadastrar empresa" sibling à BindingsTable (`<OnboardingWizardLauncher prefilledConnectionId>`).
- **Aba "Tempo real" → "Sincronização"** (`tabs/sincronizacao-tab.tsx` substitui `tempo-real-tab.tsx`): 4 KPI cards polling-aware (Última sync, Runs última 1h sample-corrected, Erros 24h, Linhas sync 1h). Lista de até 200 runs `polling_*` (polling UI 5s + Pause/Play). Texto explicativo "Esta tela atualiza a cada 5s. O worker faz o sync efetivo a cada {N}s".
- **Aba Jobs** (`tabs/jobs-tab.tsx`): SSR-first (`getJobsStatus({ connectionId })` no server). `JobsPanel` agora aceita prop `connectionId` e filtra por accountIds dessa conn (lookup via Prisma). Empty state melhorado quando 0 rows.
- **Aba Saúde** (`tabs/saude-tab.tsx`): 4 KPIs polling-aware (Heartbeat, Runs 24h est., Erros 24h, Jobs com erro 24h). NOVO bloco "Erros recentes (top 5)" com tabela compacta + empty state OK em emerald quando 0.

### Tour interativo (NOVO)
- **`<TourTriggerButton>`** reutilizável (botão "?" ghost h-8 w-8). Disparado em todas as 6 telas:
  - **Lista raiz**: `listaTour` (4 steps).
  - **Aba Conexão**: `conexaoTour` (4 steps).
  - **Aba Sincronização**: `sincronizacaoTour` (4 steps).
  - **Aba Jobs**: `jobsTour` (3 steps).
  - **Aba Saúde**: `saudeTour` (3 steps).
  - **Edit Connection Dialog**: `editConnectionTour` (4 steps).
- `data-tour` attrs adicionados em ~30 elementos para servir de targets dos overlays.
- 13 sanity tests em `__tests__/configs.test.ts` (id único, ≥1 step, targetSelectors `[data-tour=...]`, sem duplicação).

### Limpezas / removals
- `src/app/api/webhooks/nexus-chat/[token]/route.ts` + tests — DELETED.
- `src/lib/nexus-chat/webhook-credentials.ts` + tests — DELETED.
- `src/lib/actions/nexus-chat/realtime-stream.ts` + tests — DELETED (substituído por `sync-stream.ts`).
- `src/components/settings/nexus-chat/tabs/tempo-real-tab.tsx` — DELETED (substituído por `sincronizacao-tab.tsx`).
- `prisma/seed.ts` — removida Fase 2 backfill webhook.
- `src/middleware.ts` — sem isenção `/api/webhooks/nexus-chat/*`.
- `src/components/users/audits-table.tsx` — labels `webhook_*` substituídos por `polling_*`.

### Métricas
- ~50 commits granulares.
- **108 tests novos** (cursor 6 + 10 table-syncs × 3 = 30 + run-delta-sync 6 + run-full-sweep 3 + delta-sync processor 3 + full-sweep processor 2 + scheduler 5 + connections 4 + sync-stream 3 + health-metrics 6 + form-dialog 3 + wizard 2 + connection-list 2 + sincronizacao-tab 4 + tour-configs 13 + jobs.ts 4 = ~108).
- **1794/1814 verde** suite global (20 falhas restantes são pré-existentes em `integrations-power-bi.test.ts` desde v0.39, não introduzidas pela v0.41).
- Typecheck zero erros em todos os arquivos da release.
- 8 subagents paralelos (1 schema + B-lib + B-orquestrador + B-workers + C-actions + D-webhook-removal + E-UI + F-tour + G-docs).
- ui-ux-pro-max invocado em todos os subagents UI.
- Plan v1 (3793L) → Review #1 (28 achados) → v2 delta → Review #2 (20 achados) → v3 final consolidado (Apêndice C OVERRIDES com 9 tasks novas + 14 substituídas).

### Checklist pós-deploy
- [ ] `/api/health` retorna v0.41.0
- [ ] Login + abrir `/bancos-de-dados` (linha clicável funcional)
- [ ] `/bancos-de-dados/[id]?tab=sincronizacao` mostra runs aparecendo dentro de 1 min
- [ ] **Pedir ao João:** acessar painel admin do Nexus Chat e **remover o webhook cadastrado** (endpoint dá 404 agora — Chatwoot retentaria 4xx pra sempre, gera lixo)
- [ ] Validar tour funcional nas 6 telas (lista + 4 abas + Edit Dialog) — botões "?" abrem overlay

### Não-objetivos (hotfix v0.42+)
- DELETE real de IDs órfãos no full sweep (v1 só detecta).
- Métricas de polling no dashboard global (sample correction precisa contexto melhor para confiança).
- Configurar intervalo per-binding em vez de per-connection.
- Constraint NOT NULL em `connection_id` em todos os legados (ainda usam `chatwootQuery`).

---

## [v0.40.0] 2026-05-04 — Multi-tenant Realtime Fase 3 (UI completa em 4 abas + Wizard onboarding)

> **Épico 3 de 3.** Transforma `/bancos-de-dados/[id]` em UI rica de 4 abas (Conexão / Tempo real / Jobs / Saúde) + wizard de onboarding empresa de 4 steps. Super_admin opera todo o ciclo (criar conn → cadastrar empresa → ver eventos webhook ao vivo → diagnosticar lag → testar conn) num lugar só, sem precisar saber URLs de páginas legadas.

### Mudanças

- **`<ConnectionDetailTabs>`** (`src/components/settings/nexus-chat/connection-detail-tabs.tsx`):
  - Tabs ARIA via base-ui (`<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`).
  - URL state `?tab=conexao|tempo-real|jobs|saude` (preserva tab em refresh/back).
  - Code splitting: cada tab via `dynamic()` — bundle inicial só carrega Conexão (~50KB gzip vs 200KB monolítico).
  - Keyboard nav (ArrowLeft/Right/Home/End) + focus management + Skeleton placeholders.
- **Aba 1 — Conexão** (`tabs/conexao-tab.tsx`):
  - Header com nome + host:port + banco + usuário + sslMode tipográficos.
  - `<BindingsTable>` inline (já existente da v0.39).
  - Itens deferidos pra hotfix v0.41+: card webhook explícito, card ações operacionais (testar/pausar/apagar) — hoje ações ficam na lista raiz.
- **Aba 2 — Tempo real** (`tabs/tempo-real-tab.tsx`):
  - 4 KPI cards (Eventos último 1h, Latência média, Erros 24h, Última heartbeat) com paleta semântica.
  - Lista de eventos webhook recentes (até 200, sem virtualização, render simples — leve).
  - Pause/Play do polling 5s (toggle visível, com badge "Pausado" quando idle).
  - Empty states (Inbox sem CTA) + error banner rose.
  - Refator do `connection-detail-tabs.tsx` pra passar `lastWebhookAt` da connection.
- **Aba 3 — Jobs** (`tabs/jobs-tab.tsx`):
  - Placeholder informativo com link pra page legada `/configuracoes/jobs` (mantém funcional).
  - Absorção completa via `<JobsPanel connectionId>` fica para hotfix v0.41+.
- **Aba 4 — Saúde** (`tabs/saude-tab.tsx`):
  - 4 health cards: Heartbeat (lag desde último webhook com cor semântica), Eventos 24h, Erros 24h, Jobs com erro 24h.
  - Lista de audit logs últimas 50 ações `webhook_*` (Table com badge action + timestamp + details snippet).
  - Snapshot único via `getConnectionHealthSnapshot` (sem polling).
- **Server Actions novas:**
  - `listRecentWebhookEvents({ connectionId, limit })` — lista audit logs `webhook_*` da connection (cap 500). super_admin only.
  - `getConnectionHealthSnapshot(connectionId)` — agrega lag, count webhooks 24h, count erros 24h, count job errors 24h.
- **`<OnboardingWizard>`** (`wizard/onboarding-wizard.tsx`):
  - Stepper visual 4 steps (violet ativo / emerald concluído / gray pendente, linha de progresso entre indicadores).
  - Step 1: escolher connection existente (cards-radio até 20, Combobox com search acima de 20) ou link "Criar nova" que abre `<ConnectionFormDialog>`.
  - Step 2: form `chatwoot_account_id` (number) + `displayName` (text) com validação inline.
  - Step 3: URL do webhook copiável + lista de eventos canônicos + checkbox obrigatório "Já cadastrei o webhook no painel do Nexus Chat".
  - Step 4: confirmação + 2 CTAs lado-a-lado ("Ver eventos chegando" → `/bancos-de-dados/<id>?tab=tempo-real`; "Liberar acesso de usuários" → `/usuarios`) + botão "Onboardar outra empresa" (reset state).
  - Animação fade motion-safe (respeita prefers-reduced-motion).
  - Touch targets ≥44pt, `useReducer` com state estruturado, validação por step.
- **`<OnboardingWizardLauncher>`** (client wrapper) — botão "Onboardar empresa" violet com `<Plus>` no topo da page `/bancos-de-dados`.

### Decisões técnicas relevantes

- **Prisma `AuditAction` enum não suporta `startsWith`** — `listRecentWebhookEvents` usa `in` com lista explícita das 6 ações `webhook_*`.
- **Polling 5s em Tempo real** (sem SSE nesta fase) — 12 req/min/super_admin é negligível. SSE evolução Fase 3.5.
- **Pause/Play polling** — `setInterval` cleanup em unmount + ao trocar `paused`. Ao retomar, dispara fetch imediato.
- **Code splitting por aba** via `next/dynamic` — Recharts (futuro) só baixa quando user clicar Tempo real.
- **Step 3 wizard checkbox** usa `<input type="checkbox">` nativo estilizado (base-ui Checkbox não disparava `onCheckedChange` consistentemente em jsdom).

### Métricas

- ~7 commits granulares.
- 74/74 tests verde no escopo (`src/components/settings/nexus-chat`, `src/lib/actions/nexus-chat`, `src/app/api/webhooks`).
- Typecheck zero erros.
- Suite global: similar à v0.39 (mantém 20 falhas pré-existentes em integrations-power-bi).

### Não-objetivos (deferidos para hotfix v0.41+)

- Card webhook explícito + card ações na Aba 1 (hoje ações ficam na lista raiz).
- `<JobsPanel connectionId>` filtrado dentro da Aba 3 (hoje a aba linka pra page legada).
- Stream virtualizado em Tempo real (lista atual >200 rows não virtualiza).
- Line chart Recharts eventos/min últimas 24h (cards de KPI ficam sem gráfico nesta versão).
- Redirect `/configuracoes/jobs` → `/bancos-de-dados` (mantida funcional para JobsTab linkar enquanto absorção não acontece).
- Sidebar reorg adicional (já feito na v0.39).
- Constraint NOT NULL em `connection_id` + nova PK em `chatwoot_facts_*`.
- Refator dos 4 sites legados (sla-content/csat-content/llm-tools/power-bi-dim-sync) ainda usando `chatwootQuery`.

## [v0.39.0] 2026-05-04 — Hotfix Fase 2 (HMAC removido, sidebar reorganizado, page bindings)

> Hotfix da Fase 2 baseado em screenshots e feedback do João pós-deploy v0.38. **Account Webhooks no Chatwoot self-hosted não suportam HMAC** (pesquisa confirmada — apenas API Channel + Agent Bot Webhooks têm desde Chatwoot v4.13.0). HMAC removido completamente; token de 32 bytes random na URL é a única autenticação. UI simplificada drasticamente (sem campo Secret confuso). Menu reorganizado conforme pedido: nova entrada "Bancos de dados" no nível superior do sidebar; "Jobs de pré-agregação" removido (page continua acessível por URL `/configuracoes/jobs` como backup operacional até Fase 3 absorver). Sheet lateral de bindings substituído por **page dedicada** `/bancos-de-dados/[id]`.

### Mudanças

- **Endpoint webhook (`src/app/api/webhooks/nexus-chat/[token]/route.ts`):**
  - Removidos imports `crypto.createHmac`, `timingSafeEqual`, `decrypt`.
  - Removida validação de header `x-chatwoot-hmac-sha256` (era 401).
  - Connection lookup não exige mais `webhook_secret_enc` populado.
  - Mantido tudo o resto: rate limit 100/min/token, debounce 2s, publish 4x, lastWebhookAt update, audit sample 1/100, log JSON estruturado, payload limit 1MB, JSON parse tolerante.
  - 10/10 tests verde (cobrindo 9 cenários da spec — HMAC mismatch test removido).

- **Geração de credenciais (`webhook-credentials.ts`):**
  - `generateWebhookCredentials()` (com token+secretPlain+secretEnc) → `generateWebhookToken()` simples.
  - Não usa mais `encrypt`.

- **Server Actions (`actions/nexus-chat/connections.ts`):**
  - `createNexusChatConnection` retorna `{ id }` (não mais `webhookSecretPlain`).
  - `regenerateConnectionWebhookSecret` → `regenerateConnectionWebhookToken` (rotação de token, audit `webhook_token_regenerated`).
  - 16/16 tests verde.

- **Seed (`seed.ts`):**
  - Backfill Fase 2 popula só `webhookToken`. `webhookSecretEnc` fica NULL nas connections.

- **Sidebar (`lib/constants/nav.ts`):**
  - Adicionada entrada **"Bancos de dados"** (super_admin only, ícone `Database`) no nível superior.
  - Removida entrada **"Jobs de pré-agregação"** (page `/configuracoes/jobs` continua existindo, acessível por URL — substituída pela Fase 3 quando "Bancos de dados" virar UI rica em 4 abas).

- **Rota nova (`/bancos-de-dados`):**
  - `src/app/(protected)/bancos-de-dados/page.tsx` — lista de connections (igual à antiga em `/configuracoes/conexoes` mas com botão **Empresas** que linka pra detalhe ao invés de abrir Sheet).
  - `src/app/(protected)/bancos-de-dados/[id]/page.tsx` — page detalhe da connection com tabela inline de bindings (não mais Sheet lateral).
  - `src/app/(protected)/configuracoes/conexoes/page.tsx` virou redirect 302 para `/bancos-de-dados` (backwards compat).

- **`<BindingsTable>` novo component (`bindings-table.tsx`):**
  - Tabela com Empresa | Account ID | Status (switch enable/disable) | Ações (Editar/Apagar).
  - Empty state amigável.
  - Substitui `<BindingListSheet>` (deletado).

- **`<ConnectionList>`:**
  - Removido import + uso de `BindingListSheet`.
  - Removido state `sheet`.
  - Botão **Ver** (Eye) → **Empresas** (Users) navegando pra `/bancos-de-dados/[id]`.
  - Removida prop `bindingsByConnection`.

- **`<ConnectionFormDialog>`:**
  - Removido bloco Alert success "Secret gerado".
  - Removido botão "Regenerar secret" + `<AlertDialog>` confirmação.
  - Removido state `revealedSecret`, `confirmRegenerate`, `regenPending`.
  - Removidos imports `AlertTriangle`, `RotateCcw`, `ShieldCheck`, `regenerateConnectionWebhookSecret`.
  - Bloco Webhook agora mostra: **URL copiável** + texto explicativo "O painel do Nexus Chat não tem campo de secret — a autenticação acontece pelo token único embutido na URL (32 bytes random)" + lista de eventos.
  - 7/7 tests verde (4 antigos sobre Secret/Regenerar removidos, 1 novo sobre fluxo simplificado de create).

- **PasswordInput onChange fix:** corrigido handler `onChange={(e) => update(...)}` → `onChange={(value) => update(...)}` (PasswordInput passa string, não event).

### Decisão sobre HMAC (registro de pesquisa)

Pesquisa concluída: **Account Webhooks no Chatwoot self-hosted NÃO TÊM campo Secret**. HMAC só existe em:
- API Channel webhooks
- Agent Bot webhooks

Introduzidos em **Chatwoot v4.13.0 (abril 2024)**. Header correto seria `X-Chatwoot-Signature` (formato `sha256=<hex>`) com payload assinado `"{timestamp}.{raw_body}"`.

Como o cliente Matrix usa Account Webhooks, HMAC é impossível pelo painel atual do Chatwoot. **Token de 32 bytes random no path da URL** é segurança suficiente:
- 256 bits de entropia (não-enumerável).
- HTTPS-only (não vaza em trânsito).
- Idempotência dos jobs `refresh-by-*` (UPSERT) — abuse causa carga, não corrompe dados.
- Rate limit 100/min/token mitiga DoS.
- Audit log captura tudo (mesmo amostrado).

Schema preserva coluna `webhook_secret_enc` (NULL na Fase 2) — caso futuro migre pra API Channel webhook ou Account Webhooks ganhem suporte HMAC, é só popular.

### Métricas

- ~12 commits granulares.
- 79/79 tests verde no escopo (typecheck zero).
- Suite global: 1715/1735 verde (mantém 20 falhas pré-existentes em integrations-power-bi).

### Não-objetivos (Fase 3)

- UI rica em 4 abas (Conexões / Tempo real / Jobs / Saúde) dentro de `/bancos-de-dados/[id]`.
- Wizard de onboarding nova empresa.
- Aba "Jobs" absorve a `/configuracoes/jobs` (que perde o entry no sidebar agora mas mantém URL).
- Constraint `NOT NULL` em `connection_id` + nova PK.
- Refator dos 4 sites legados (sla-content/csat-content/llm-tools/power-bi-dim-sync) ainda usando `chatwootQuery`.

## [v0.38.0] 2026-05-04 — Multi-tenant Realtime Fase 2 (Webhook event-driven)

> **Épico 2 de 3.** Substitui cron de 5 min por **webhook event-driven**: Nexus Chat (Chatwoot) dispara `POST /api/webhooks/nexus-chat/[token]` a cada evento (`conversation_created`, `message_created`, etc), o app valida HMAC SHA-256 timing-safe, faz rate limit Redis (100/min/token), enfileira 4 jobs `refresh-by-*` com debounce 2s (coalescência de bursts via `jobId` único por bucket) e publica `facts:refreshed` no Pub/Sub. Latência: ~ms (vs 5 min cron). Cron rebaixado para 30 min como fallback.

### Endpoint webhook (`src/app/api/webhooks/nexus-chat/[token]/route.ts`)
- POST com body cru (HMAC sobre raw bytes — `req.text()`, NÃO `req.json()`).
- Limite de payload 1 MB (anti-DoS: validação dupla via `content-length` + `rawBody.length`).
- Lookup connection por `webhookToken` + status='active' + secret presente. **404 silencioso** se inválido (não revela existência).
- Rate limit Redis (`incr` + `expire 60s`) com try/catch — degrade graceful sem rate limit se Redis cair.
- HMAC SHA-256 timing-safe (`crypto.timingSafeEqual`) sobre header `x-chatwoot-hmac-sha256`. **401** com audit `webhook_rejected_hmac` se inválido.
- Resolve binding `(connectionId, accountId)`. Sem binding → **200 OK ignored** (Chatwoot trata 4xx como retry forever; jamais devolver 4xx para casos esperados).
- Enfileira 4 jobs com `jobId: refresh:${dim}:${conn.id}:${accountId}:${bucket}` (bucket = `floor(now / 2000)`) + `delay: 2000ms`. Bursts dentro do mesmo bucket são deduplicados pelo BullMQ.
- Publica 4 eventos `facts:refreshed` no Pub/Sub (1 por dimensão).
- Update `lastWebhookAt` fire-and-forget.
- Audit log sample 1/100 (anti-flood) + log JSON estruturado em stdout SEMPRE (diagnóstico Portainer).
- 10/10 tests verde cobrindo 9 cenários da spec + 1 GET 405.

### Geração de credenciais (`webhook-credentials.ts`)
- `generateWebhookCredentials()` cria token (32 bytes hex = 64 chars) + secret (32 bytes hex) + secret cifrado (AES-256-GCM).
- `secretPlain` retornado UMA VEZ pelo Server Action — caller (UI) exibe em Alert verde com botão Copy.
- `createNexusChatConnection` agora gera webhook automaticamente em toda nova conexão.
- `regenerateConnectionWebhookSecret(id)` super_admin only — rotação de secret com audit log.

### Backfill seed (Fase 2)
- `backfillWebhookCredentialsIfNeeded()` em `src/lib/nexus-chat/seed.ts`.
- Lock advisory `8472939` (distinto da Fase 1 `8472938`).
- Idempotente via `app_settings.webhooks_seeded_at`.
- Para cada connection sem `webhookToken`, gera token+secret cifrado.

### Listener Pub/Sub no App (`src/instrumentation.ts`)
- Hook `register()` rodado uma vez no boot do servidor Next.js.
- Subscribe no canal `nexus-insights:realtime`.
- Ao receber `connection:updated` ou `connection:deleted`, chama `invalidateNexusChatPool(connectionId)`.
- Sem o listener, pool do App ficaria stale até 30 min (janitor).
- Hot reload safe via `globalThis.__nexusAppPubsubSubscriber` guard.

### `<RealtimeMount>` em todas as 7 pages de relatório
- Wrapper client invisível (`src/components/reports/realtime-mount.tsx`) que monta `useFactsRealtime` com `(connectionId, accountId)`.
- Adicionado em **Conversas** e **Mensagens não respondidas** (as 2 pages que não têm `<FactsFreshness>`).
- 5 outras pages (Visão Geral, Distribuição, Equipe, Origem & IA, Performance, Dashboard) já recebem `<FactsFreshness>` via Fase 1.
- Total: 7/7 pages reagem a webhook em ~1s (debounce do hook).

### Cron rebaixado para 30 min fallback
- Schedulers antigos `facts-refresh-by-{account,inbox,agent,team}` removidos via `removeJobScheduler`.
- Schedulers novos com sufixo `-fallback` em pattern `*/30 * * * *`.
- Webhook é gatilho primário; cron pega bordas (webhook quieto, replay, rede).

### UI super_admin estendida (`/configuracoes/conexoes`)
- Bloco **Webhook** no `<ConnectionFormDialog>`:
  - Alert success com `secretPlain` (mostrado UMA VEZ ao criar/regenerar) + botão Copy + warning "Você não verá esta chave novamente".
  - URL completa do webhook copiable (`window.location.origin/api/webhooks/nexus-chat/{token}`).
  - Botão **Regenerar secret** com `<AlertDialog>` confirmação destrutiva.
  - Lista de eventos canônicos a marcar no Chatwoot (`conversation_created`, `_updated`, `_resolved`, `message_created`, `conversation_status_changed`).
- Coluna **Webhook** no `<ConnectionList>`: badge "Configurado" (emerald) ou "Sem webhook" (amber) baseado em `webhookToken IS NOT NULL`.
- `ui-ux-pro-max` invocado obrigatoriamente — paleta semântica (emerald success, amber informativo, rose destrutivo), aria-live="polite" no Alert, motion-safe, dark/light pareados.

### `AuditAction` enum +6 valores
- `webhook_received`, `webhook_rejected_hmac`, `webhook_rejected_rate_limit`, `webhook_no_binding`, `webhook_token_regenerated`, `webhook_secret_regenerated`.
- `audits-table.tsx` `Record<AuditAction>` atualizado com 6 entries novas (evita CI break).

### Schema additivo
- Coluna `last_webhook_at` em `nexus_chat_connections` (nullable). Populada pelo endpoint a cada webhook recebido. Usado para detectar quietude (cron fallback + diagnóstico).

### Workflow rigoroso
- Spec v3 (1245 linhas, 46 achados) já estava pronta da sessão anterior.
- **Plan v3** novo (~750 linhas, 54 achados em 2 pentes-finos REAIS) com 9 lotes L0-L9.
- **5 subagents paralelos** (L4 endpoint, L5 instrumentation, L6 RealtimeMount, L7 cron, L8 UI) em coordenação multi-agente sem conflito.
- `ui-ux-pro-max` invocado em L8.
- Runbook canônico em `docs/runbooks/webhook-nexus-chat.md` (11 itens — cadastro Chatwoot, validação curl, regeneração, troubleshooting, smoke test).

### Métricas
- ~22 commits granulares.
- Tests: 1715/1735 verde (20 falhas pré-existentes em integrations-power-bi.test.ts, escopo distinto).
- Typecheck zero erros.
- ~6 hotfix tests (advanced-filters-sort-options.test mock atualizado).

### Não-objetivos (Fase 3)
- UI rica em 4 abas (Conexões, Tempo real, Jobs, Saúde).
- Wizard de onboarding nova empresa.
- Sidebar reorg (remover "Jobs de pré-agregação").
- Constraint NOT NULL + nova PK em `chatwoot_facts_*`.
- Refator dos 4 sites legados ainda usando `chatwootQuery` (sla-content, csat-content, llm/tools/executor, power-bi/dim-sync).

### Migrations em produção
1. Deploy v0.38.0 → ensureNexusChatTables roda no boot do worker (idempotente DDL: ADD VALUE enum + ADD COLUMN last_webhook_at).
2. Seed Fase 2 (backfill webhook na connection seed) roda automaticamente via advisory lock 8472939.
3. Validar em `/configuracoes/conexoes` (super_admin): connection "Padrão (legado)" tem webhook gerado.
4. Cadastrar webhook no painel admin do Chatwoot Matrix (1x para cada account: id=2 e id=9).
5. Smoke test: abrir uma conversa no Chatwoot e ver UI Nexus Insights atualizar em ~1s.

## [v0.37.0] 2026-05-04 — Multi-tenant Realtime Fase 1 (Fundação invisível)

> **Épico 1 de 3.** Fundação multi-tenant para Nexus Insights virar hub conectado a múltiplas instalações Nexus Chat (cada uma com várias accounts/empresas). Sem mudança visível para admin/manager/viewer das empresas — super_admin ganha rota administrativa nova `/configuracoes/conexoes`. Webhook em tempo real e UI completa em 4 abas ficam para Fases 2 e 3.

### Schema
- **Models novos:** `nexus_chat_connections` (instalação física com host/port/db/user/senha cifrada AES-256-GCM/sslMode/status/webhook_token+secret futuros) e `company_chat_bindings` (vínculo connection × account_id com display_name + enabled, constraint operacional account_id único entre connections enabled).
- **`connection_id UUID` em `chatwoot_facts_*`** (6 tabelas, opcional na Fase 1, vira PK em fase futura).
- **`AuditAction` enum +7 valores:** `nexus_chat_connection_*` (created/updated/deleted/tested) + `company_chat_binding_*` (created/updated/deleted).

### Pool dinâmico + isolamento
- `src/lib/nexus-chat/pool.ts` — `getNexusChatPool(connectionId)` com cache `Map<connectionId, Pool>`, janitor TTL 30 min, hot-reload safe.
- `src/lib/reports/active-connection.ts` — `getActiveConnectionId(user)` via `cache()` do React, fail-closed em `NoActiveBindingError` e `AmbiguousBindingError`.
- Defesa em profundidade 5 camadas: middleware → getCurrentUser → assertAccountAccess → getActiveConnectionId → getNexusChatPool.

### Seed automático no boot
- `src/lib/nexus-chat/seed.ts` — idempotente via `pg_try_advisory_lock(8472938)`. Parseia `CHATWOOT_DATABASE_URL` (pg-connection-string), cria connection "Padrão (legado)" + bindings para cada `chatwoot_account_id` distinto em `user_account_access` + backfill `connection_id` nas 6 tabelas chatwoot_facts_*.
- `ensureNexusChatTables` (DDL idempotente runtime) — `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` + `ALTER TYPE ADD VALUE IF NOT EXISTS`.

### 17 queries refatoradas para multi-tenant
Todas em `src/lib/chatwoot/queries/*` agora recebem `connectionId: string` como primeiro parâmetro e usam `queryNexusChat`:
- conversas-list, dashboard-data, dashboard-drill-down, dashboard-kpis, home-summary, status-distribution.
- meta-cache + meta-cache-for-user (cache key `:v2` inclui connectionId — invalidação natural no deploy).
- leads-recebidos, matrix-ia, mensagens-nao-respondidas, por-departamento, por-estado, ranking-atendentes, tempos-resposta, volumetria-dow, volumetria-heatmap.

### Server Actions atualizadas
- 8+ Server Actions em `src/lib/actions/reports/*` resolvem `connectionId` via `getActiveConnectionId(user)`.
- `period.ts` (`getMinReportDate`) — idem.

### Worker BullMQ multi-tenant
- `getBindingsToRefresh()` (substitui `getAccountsToRefresh()`) em `shared.ts` — JOIN `company_chat_bindings` × `nexus_chat_connections` (enabled + active + not deleted).
- `withMetaUpdate(dimension, connectionId, accountId, fn)` — UPSERTs em `chatwoot_facts_meta` gravam `connection_id`. PK `(dim, account_id)` mantida nesta fase.
- 4 jobs `refresh-by-*` (account/inbox/agent/team) usam `queryNexusChat(connectionId, ...)` e gravam `connection_id` nos UPSERTs.
- `facts.ts` (reads internos) ganham `connectionId` opcional + filtro `WHERE connection_id = $X`.

### Realtime universal
- `RealtimeEvent.facts:refreshed` ganha `connectionId`. 2 eventos novos: `connection:updated` (invalida pool no app/worker) e `connection:deleted` (toast Sonner + redirect 3s no client).
- `useFactsRealtime` filtra por `(connectionId, accountId)`.
- `<FactsFreshness>` exige `connectionId`. Propagado em 6 pages de relatório.

### UI super_admin `/configuracoes/conexoes`
- Page server (super_admin only — outros redirect /dashboard).
- Server Actions CRUD em `src/lib/actions/nexus-chat/{connections,bindings}.ts` (Zod, encriptação, audit log, rate limit).
- `<ConnectionList>` + `<ConnectionFormDialog>` + `<BindingListSheet>` + `<BindingFormDialog>` (base-ui, ui-ux-pro-max consultado em todos).
- `/api/health` ganha `connections[]` + probe via `queryNexusChat` da primeira connection ativa.

### Workflow
- **3 specs v3** com double-check: Fase 1 fundação (818 linhas, 58 achados), Fase 2 webhook (1245 linhas, 46 achados), Fase 3 UI completa (964 linhas, 46 achados).
- **Plan Fase 1 v3** (1491 linhas, 48 achados) com 9 lotes L0-L9.
- **6 subagents paralelos** em coordenação multi-agente (L2 dashboard, L3 conversas+meta-cache, L4 mensagens, L4 8-queries, L6 jobs, L8 UI super_admin).
- `ui-ux-pro-max` invocado obrigatoriamente em toda task de UI.
- Runbook canônico em `docs/runbooks/multi-tenant-realtime.md`.

### Métricas
- ~50 commits granulares.
- ~270 tests novos verde.
- Typecheck zero erros.
- Suite: 1687/1707 verde (20 falhas pré-existentes em integrations-power-bi.test.ts, escopo distinto).

### Não-objetivos (fases seguintes)
- Endpoint webhook `/api/webhooks/nexus-chat/[token]` (Fase 2).
- Substituir cron por trigger event-driven (Fase 2).
- UI rica em 4 abas (Conexões, Tempo real, Jobs, Saúde) — Fase 3.
- Wizard de onboarding nova empresa (Fase 3).
- Sidebar reorg (Fase 3).
- Constraint `NOT NULL` em `connection_id` + nova PK — fase de cleanup com snapshot pré-rollback.
- Refator dos 4 sites legados ainda usando `chatwootQuery` (sla-content, csat-content, llm/tools/executor, power-bi/dim-sync).

## [v0.36.0] 2026-05-04 — Dashboard chart fixes (PeriodNavigator size + cross-period sync)

> 2 bugs do gráfico "Conversas por hora/dia" do menu Dashboard. Workflow rigoroso: plan v1→v2→v3 com 16+ achados em 2 pentes-finos REAIS + subagent-driven-development com TDD em cada task + ui-ux-pro-max em T1. Pula v0.35 (ocupada por bugfix paralelo de Conversas).

### Fixes

- **B1 — PeriodNavigator esticado:** o `<CardHeader>` do shadcn é grid com regra `has-data-[slot=card-action]:grid-cols-[1fr_auto]`. Sem o slot, filhos viraram linhas full-width — tag de período do gráfico ficava com largura fixa enorme. Solução: envolver `<PeriodNavigator>` em `<CardAction>` (primeiro uso real do componente exportado em `card.tsx`). Fit-content + alinhamento direito do título.
- **B2 — Contagens divergentes Dia/Semana/Mês:** chart Dia mostrava 1 conversa Aberta no dia 03/05 (correto), mas chart Semana e Mês mostravam 0 no mesmo bucket. Fonte: `sqlChart` usava `WITH created_buckets / activity_buckets ... FULL OUTER JOIN ON cb.bucket = ab.bucket`. Em cenário "1 conversa antiga reaberta hoje sem novas conversas criadas hoje", o bucket "hoje" só existia em uma CTE — embora COALESCE devesse coalescer, observamos divergência empírica. Refator: `UNION ALL + GROUP BY bucket`, equivalente em álgebra relacional, sem dependência de match exato de timestamptz. Cache key v8→v9 para invalidar resultados antigos.

### Tests

- `period-navigator-card-action.test.tsx`: 1 spec garante `data-slot="card-action"` envolvendo o `<PeriodNavigator>` no `<ConversationsLineChart>`.
- `dashboard-data-chart-invariant.test.ts`: 4 specs cobrindo invariante cross-period (Dia open=1, Semana bucket 03/05 open=1, Mês bucket 03/05 open=1, consistência entre os 3). Mocks robustos detectam a query refatorada via marcador `WITH unioned AS`.

### Diagnostics

- `[dashboardData diag G2 v2]`: log estendido com KPIs (open/resolved) + totais por série + dump por bucket (max 35 entries) — facilita debug de regressão futura.

---

## [v0.35.0] 2026-05-04 — Conversas Bugfix (XLSX rows fantasma + filtro Documento)

> 2 bugs urgentes da v0.32 reportados pelo João em produção. Workflow: plan v1→v2→v3 (14 achados em 2 pentes-finos REAIS) + subagent-driven com TDD em ambos. 3 commits granulares (T1+T2+release) + tests verde + typecheck clean no escopo.

### Bug fixes

- **T1 — XLSX export sem rows fantasma:** João reportou que exportação com poucas rows (1) gerava rows em branco extras no arquivo final. Causa: combinação de `ws.columns = [...]` em ExcelJS com `views: { state: "frozen", ySplit: 1 }` pré-aloca rows fantasma. Fix: refator pra `ws.addRow(headers)` direto + widths/format aplicados via `ws.getColumn(i).width` (1-based) e `headerRow.font/fill`. Frozen pane mantido. Tests: 3 cenários (0/1/3 rows) validando `actualRowCount` + `rowCount` exatos.

- **T2 — Filtro Documento aplica no pipeline da tabela:** João reportou que filtro Documento (CPF/CNPJ/Sem) não filtrava nada. Causa: na v0.32 F1, a UI (chip + dropdown + propagação pro Export) ficou completa, MAS a tabela visível NÃO chamava `matchDocumentTypes` na pipeline e `<ConversasTable>` nem recebia `documentTypes` como prop. Fix: ConversasTable ganha prop `documentTypes`; ConversasPageClient passa `filterState.documentTypes`; pipeline ganha etapa `docFilteredRows` entre `searchedRows` e `applyConditions`. Helper `matchDocumentTypes` (existente desde v0.32) finalmente cabeado. `detectDocument` identifica CPF/CNPJ por quantidade de dígitos (11/14) no `identifier` ou em `additional_attributes` (chaves `cpf/CPF/cnpj/CNPJ/document`).

### Coordenação multi-agente

3 agentes paralelos ativos durante a sessão: `claude-agente-nex-polish-v031` (escopo `/agente-nex/*`), `claude-multitenant-realtime-fase1` (Fase 1 spec/code), `claude-dashboard-conversas-chart-fix` (escopo dashboard charts). Bumpando v0.35 (skip 0.33 multitenant + 0.34 dashboard-chart). Zero conflito de código fonte.

---

## [v0.34.0] 2026-05-03 — Suite Agente Nex Polish v5 (nomenclaturas + sugestões em botões + 6 polish + bug cotação)

> Feature grande + 6 polish cirúrgicos + bug fix da cotação USD/BRL inflada (>R$6/USD por bug de spread setado pra 1.40+). Workflow rigoroso (plan v1→v2→v3 com 50 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em cada task · ui-ux-pro-max em todas as tasks UI · two-stage review automático). 17 commits granulares (A1+A2+B1+B2+C1+C2+C3+C4+D1+D2+D3+D4+D5+D6+E1+E2+E3) + commit do release. Bump 0.32→0.34 (pula 0.33 — outro agente ativo no Multi-tenant Realtime Fase 1 já marcou commits T0.X com prefix v0.33).

### Schema additive (5 columns)
- `nex_settings.terminology JSONB DEFAULT '{}'` — mapa termo→significado pra interpretar nomenclaturas customizadas.
- `nex_settings.suggestions_enabled BOOLEAN DEFAULT false` — toggle "Sugestões em botões".
- `nex_settings.seeded_v3_at TIMESTAMPTZ NULL` — flag de pre-seed idempotente (evita re-aplicação ao limpar terminology).
- Pre-seed terminology Matrix (idempotente via `seeded_v3_at IS NULL`): 8 termos (estados→inboxes, colaboradores/funcionários/minha equipe/meu time→agentes, departamento/setor/time→teams).
- `llm_usage.is_playground BOOLEAN DEFAULT false` — distingue Bubble vs Playground. Trade-off: rows pre-v0.34 todas false default (sem migration retroativa).

### Configuração (/agente-nex/configuracao)
- `exchange-rate` hardcode spread=1.10 — fix bug cotação inflada (commercial × 1.40 estava dando >R$6/USD; agora 1.10 ≈ IOF 3.5% + 6.5% spread real ≈ R$5.45). `setCardSpread()` virou no-op + `console.warn` (back-compat).
- Remove Spread cartão UI + UsdRateTicker UI — cotação agora 100% nos bastidores.
- Remove botão "Criar API key" inline — mantém só "Adicionar crédito" via `topUpUrl`.
- Toggle "Agente Nex ativo" redesign — linha única (sem `role="group"` aninhado), `id="nex-bubble-toggle"`.

### Prompt (/agente-nex/prompt)
- Section "Nomenclaturas e termos" entre Tom e Guardrails (cap 50 termos × 100 chars). Server Action `saveTerminologyAction` super_admin-gated.
- Toggle "Sugestões em botões" entre Nomenclaturas e Guardrails. Server Action `setSuggestionsEnabledAction` super_admin-gated.
- `composeSystemPrompt` injeta seções condicionais "## Terminologia" e "## Sugestões clicáveis" no system prompt.
- Remove frase "Preview somente leitura..." do PromptPreviewCard quando super_admin (mantém pra outros perfis).
- KB rename: "Adicionar documento" → "Adicionar conhecimento" (3 lugares: kb-section.tsx + kb-upload-dialog.tsx + tests).

### Bubble (Sugestões em botões + isPlayground propagação)
- `SuggestionsBar` componente compartilhado novo (chips violet outline + onPick callback). Usado em nex-chat-panel + playground-sheet.
- `runNex extractSuggestions` parser com regex ancorada em início-de-linha. Extrai sufixo `[[suggestions]]:item|item` da resposta do LLM. Cap 4 sugestões × 80 chars.
- `RunNexResult.suggestions: string[]` não-opcional (sempre array, default `[]`).
- `logUsage` SEMPRE chamado (remove skip de v0.16 quando `isPlayground=true`). Agora sempre loga com flag `is_playground`.
- `sendNexMessage(messages, options?: { isPlayground?: boolean })` retorna `{ ok, message, suggestions }`. PlaygroundSheet passa `isPlayground=true` → log marcado.
- Render `<SuggestionsBar>` na última assistant message (Bubble + Playground). Click consume + envia sugestão como nova msg.

### Consumo (/agente-nex/consumo)
- DonutWithCenter espessura mais fina (innerR 80→75, outerR 120→110, ratio 0.68 — 35px espessura, era 40px). Tooltip volta pra fixo `top-right` (não follow-mouse — undeprecate `tooltipPosition` prop).
- Período "Hoje" vira gráfico hourly (byHour 24 buckets fixos 00:00..23:00 quando range ≤24h). Buckets vazios mostram zero (não pula horas). Card title dinâmico: "Custo por hora" quando isHourly, "Custo por dia" senão.
- Coluna "Origem" entre Data/hora e Provider — badge pill violet (Agente Nex) / amber (Playground) baseado em `row.isPlayground`.
- Filtro "Ambiente" ao lado do Provider global — `<CustomSelect>` com 3 opções (Todos / Agente Nex / Playground). State `ambiente` sincronizado com URL `?env=...`.
- `getUsageDetails` aceita `isPlayground?: boolean | null` filter — propagado via `fetchUsageDetails` (action) → consumo-content.
- colSpan da linha "Total no filtro" = 4 (era 3 — agora há Data + Origem + Provider + Modelo antes dos numbers).

### Workflow rigoroso
- Plan v1 → v2 → v3 com 2 pentes-finos REAIS (28 achados v1→v2 + 22 v2→v3 = 50 total).
- subagent-driven-development com TDD em cada task.
- ui-ux-pro-max em todas as tasks UI.
- Two-stage review (spec compliance + code quality) após cada task.

## [v0.32.0] 2026-05-03 — Conversas Filtros Polish v5 (Documento + redesign Avançado + Export pipeline)

> 9 fixes/features no menu de filtros de `/relatorios/conversas` após feedback do João sobre v0.30. Workflow rigoroso (plan v1→v2→v3 com 28 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em 4 batches sequenciais · ui-ux-pro-max em todas tasks UI · code review final via tests inline). 14 commits granulares + release · 100+ tests novos verde · typecheck 0 erros (no escopo Conversas) · sem schema DB change (apenas codec migration v1→v2 transparente).

### Fixes

- **F1 NEW FEATURE — Filtro Documento (CPF/CNPJ/Sem) no Simples:** nova seção `Documento` no `<FiltersDialog>` Simples com 3 opções multi-select (`Com CPF` · `Com CNPJ` · `Sem documento`). `FilterState.documentTypes: Array<"cpf"|"cnpj"|"none">`. URL `?docTypes=`. Helper `matchDocumentTypes` filtra rows via `detectDocument()` existente. Chip aplicado padrão "Documento: Com CPF +1" via summarize. Multi-select OR.

- **F2 — Cursor pointer nos tabs Simples/Avançado:** afford visual com `cursor-pointer`.

- **F3 — AlertDialog ao trocar de tab quando há dados:** "Você só pode usar um modo por vez" — tabs continuam clicáveis sempre, mas se há seleções no tab atual, click no outro abre AlertDialog "Trocar para filtro X vai descartar essa configuração" com Confirmar/Cancelar/X. Confirmar limpa tab origem + ativa destino.

- **F4 — "Limpar todos" respeita só o tab ativo:** se Simples ativo, zera só `inboxIds/teamIds/etc + documentTypes`; se Avançado ativo, zera só `conditionGroup`.

- **F5 — Remove botões internos Aplicar/Limpar do `<ConditionalFilters>`:** rodapé Aplicar/Limpar interno do where-clause builder ocultado via prop `hideActions={true}`. Os botões do rodapé do `<FiltersDialog>` é que prevalecem (single source of truth).

- **F6 BUG — Contador "Aplicar (N)" fantasma:** `diffFilterStates` agora aceita `{ ignoreMode?, ignoreSearch? }`. Trocar tab Simples↔Avançado não inflava mais o contador (era `mode` change contando como diff). Bug reportado pelo João: "vou pra avançado e aparece Aplicar (2) sem nada selecionado".

- **F7 ARQUITETURAL — Operador E/OU per-par no Avançado (refator schema):** `ConditionGroup { combinator, conditions }` → `ConditionGroup { items[] }` com `ConditionGroupItem { connector?, node }`. Operador é POR PAR de items irmãos (não global do grupo). Avaliação left-associative: `((A op1 B) op2 C) op3 D`. Codec v2 com auto-migrate v1→v2 — URLs antigas `?cg=` continuam funcionando (preserva presets em localStorage também).

- **F8 VISUAL — Redesign do `<ConditionalFilters>`:** João reportou "tá uma zona, uma bagunça" — múltiplos botões E/OU verticais sem hierarquia visual. Redesign:
  - Item de Condição: card cinza com ícone `<Filter h-3.5>`, hover violet sutil, botão delete aparece em group-hover.
  - Item de Grupo: card violet com ícone `<FolderOpen h-3.5 text-violet-500>` + label "GRUPO" uppercase, indentação `border-l-2 border-violet-500/30 + bg-muted/20`, conteúdo recursivo aninhado.
  - Conector entre items: chip clicável `w-9 h-5` com `E` ou `OU` uppercase + linhas tracejadas conectando. Click alterna E↔OU.
  - Animations: `motion-safe:animate-in fade-in slide-in-from-top-1 duration-200` ao adicionar item.
  - Empty state: placeholder italic.
  - Hierarquia visual via cor + ícone + indentação, não dependendo só de cor.

- **F9 NEW — Export respeita o pipeline client (searchClient + conditionGroup + documentTypes + sortStack):** export agora reflete EXATAMENTE a tabela visível, incluindo a barra de busca (que João reportou: "se eu pesquisar e exportar, tem que vir o que tá na tela"). `exportConversasAction` ganha 4 args opcionais; após `conversasList`, replica pipeline server-side via helpers já existentes (`matchSearchClient`, `applyConditions`, `matchDocumentTypes`, `sortConversasByStack`). Tooltip atualizado: "A exportação inclui a busca aplicada e os filtros".

### Internal

- `src/lib/reports/match-document-types.ts` (novo) — helper F1.
- `src/lib/reports/sort-conversas.ts` (novo) — helper sort server-safe extraído de `conversas-table.tsx` (DRY: server export + client table usam o mesmo).
- `src/lib/utils/apply-conditions.ts` — schema v2 `{ items[] }` com eval left-associative.
- `src/lib/reports/condition-group-codec.ts` — v2 codec + `migrateV1ToV2` recursivo.
- `src/lib/reports/filter-state.ts` — `documentTypes` field + `diffFilterStates(opts)` parametrizado.
- `src/components/ui/conditional-filters.tsx` — redesign visual completo + schema v2 + componente recursivo `ConditionalFiltersInner`.
- `src/components/reports/filters-dialog.tsx` — F1 seção Documento + F2 cursor + F3 AlertDialog + F4 Limpar tab-ativo + F5 hideActions.
- `src/components/reports/applied-filters-chips.tsx` — chip Documento.
- `src/components/reports/advanced-filters.tsx` — F6 contador correto + propagação F9.
- `src/components/reports/conversas-page-client.tsx` — agrega states + propaga pro Export.
- `src/components/reports/export-button.tsx` — recebe + propaga 4 args novos.
- `src/lib/actions/reports/conversas-export.ts` — replica pipeline server.
- `src/lib/reports/quick-filters.ts` — migrado pro schema v2.

### Trade-offs

- F7 schema breaking: URLs `?cg=` v1 e presets localStorage v1 são auto-migrados no decode (transparente). Encode SEMPRE escreve v2.
- F9 export passa pela query SQL primeiro (até 50k rows), depois aplica pipeline client. Performance aceitável; cache Redis amortiza fetches repetidos.
- F8 redesign visual significativo — usuários do Avançado vão notar. UX mais clara, mais consistente.

### Coordenação multi-agente

- `claude-agente-nex-polish-v031` ativo em escopo `/agente-nex/*`, `src/lib/nex/*`, `src/lib/llm/*` — sem conflito de código fonte.
- `claude-multitenant-realtime-fase1` ativo em modo spec docs only.
- Bumpando v0.32 (skip 0.31 que ficou com agente paralelo).
- Commits intercalados no main local; resolvidos via pull rebase em cada commit.

---

## [v0.30.0] 2026-05-03 — Conversas Polish v4 (correções v0.29: cells single-line + X adesivo)

> 2 fixes urgentes em /relatorios/conversas após feedback duro do João sobre v0.29. Workflow rigoroso (plan v1→v2→v3 com 22 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em T1+T2 · ui-ux-pro-max em todas as tasks UI). 3 commits granulares (T1+T2+release) · tests verde · typecheck 0 erros.

### Fixes

- **F1 — Cells da tabela voltam pra single-line + overflow-hidden + larguras maiores:** v0.29 quebrei o layout das cells aplicando `whitespace-normal break-words` (texto ficava multi-line). João pediu single-line + texto completo + sem mexer em larguras toda hora. Fix: voltar `whitespace-nowrap` + `overflow-hidden` (sem vazar pra coluna vizinha); remove `align-top`/`break-words`. `COLUMN_WIDTHS` aumenta pra cobrir percentil 99 dos textos comuns: name 240→280, inbox 180→220 (Estado), team 160→180 (Departamento), assignee 200→240 (Atendente). Sem ellipsis (clip default) — casos extremos cortam discretamente. Aplicado em desktop + mobile (10 lugares: 8 cells + h3 + Field).
- **F2 — X chips Filtros/Ordenação pouco maior + adesivo na quina:** v0.29 reduziu pra h-4 (era h-5 v0.27) e ficou pequeno demais + muito "pra dentro" do botão. João pediu pouco maior + mais "fora" do botão como adesivo na quina superior direita. Fix: h-4→h-5 + ícone X 2.5→3 + offset `-right-1/-top-1` → `-right-2/-top-2` (8px fora da borda — adesivo claro). Mantém estilo discreto idle (`text-muted-foreground` sem bg/border) + hover vermelho fosco (`hover:bg-destructive/15` + `hover:text-destructive`).

### Trade-offs

- F1 textos extremos > col width cortam discretamente sem ellipsis (decisão consciente — João não quer "..."). Widths cobrem 99% dos casos comuns.
- F1 soma de widths ~2110px desktop — scroll-x (já tem `overflow-x-auto`).
- F2 adesivo `-right-2 -top-2` cobre 8px da borda do botão (visual intencional).

---

## [v0.29.0] 2026-05-03 — Conversas Polish v3 (X duplo, X chips, colunas truncate)

> 3 fixes pontuais reportados pelo João via screenshots após v0.27/v0.28 LIVE. Workflow rigoroso (plan v1→v2→v3 com 28 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em T2/T3 · ui-ux-pro-max em todas tasks UI · code review aprovado). 4 commits granulares (T1-T3 + release) · 308/308 tests verde · typecheck 0 erros.

### Fixes

- **F1 — Esconde X nativo do `<input type="search">`:** input de busca mostrava DOIS X (nativo macOS/Webkit + custom violet h-5 da v0.27). CSS global em `globals.css` oculta `::-webkit-search-cancel-button` + `::-webkit-search-decoration` via `-webkit-appearance: none + appearance: none + display: none`. Aplicado em todos os search inputs da plataforma.
- **F2 — X chips Filtros/Ordenação discreto idle + hover vermelho + menor:** João pediu mesmo comportamento do X do search input — idle discreto (sem bg/border, só ícone cinza `text-muted-foreground`) e hover vermelho (`hover:bg-destructive/15 + hover:text-destructive`). Tamanho diminuído sutilmente: h-5 → h-4 + ícone X 3 → X 2.5. Offset ajustado pra h-4 (`-right-1 -top-1`). Mantém: cursor-pointer, focus-visible:ring, motion-safe animate-in, aria-label.
- **F3 — Colunas Estado/Departamento/Atendente sem truncate:** texto cortado com "..." impedia ver nomes completos. Fix: trocar `truncate` por `whitespace-normal break-words` (multi-line quando necessário); remover `max-w-[Xpx]` redundante (substituído pelo colgroup); aumentar `COLUMN_WIDTHS` — name 220→240, inbox 140→180, team 140→160, assignee 140→200. Cells ganham `align-top` para alinhamento consistente com cells single-line. Virtualizer `measureElement` (já existente) recalcula altura dinâmica. Aplicado em desktop + mobile (8 lugares + h3/Field auxiliares).

### Trade-offs

- F2 sem bg idle reduz affordance — mitigação via cursor-pointer + aria-label + hover claro.
- F3 textos muito longos (40+ chars) wrappam em 2-3 linhas; rows ficam com altura variável (virtualizer mede dinamicamente).

---

## [v0.28.0] 2026-05-03 — Suite Agente Nex Polish v4 (correções v0.26)

> Correções de UX/funcionalidade da v0.26 reportadas pelo super_admin (6 fixes críticos). Workflow rigoroso (plan v1→v2→v3 com 14+5 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em cada task · ui-ux-pro-max em todas as tasks UI). 9 commits granulares (E1a/E1b/E1c/E2/E3+E4/E5/E6) · todos tests verde · typecheck 0 erros · 1 schema additive (column `identity_base`).

### Prompt
- **IDENTITY_BASE editável (super_admin):** column nova `identity_base TEXT NULL` em `nex_settings`. NULL = usa default hardcoded; valor setado = override. Server Actions `saveIdentityBaseAction(text)` e `resetIdentityBaseAction()` (super_admin-gated). composeSystemPrompt: `cfg.identityBase ?? IDENTITY_BASE` (advancedOverride continua precedendo TUDO — modo manual).
- **PromptPreviewCard sem collapse:** `<pre>` do prompt SEMPRE visível (era oculto-por-default em v0.26 — feedback rejeitou). Removido botão Maximizar; só Copiar + Editar (super_admin) no header.
- **Editar abre IdentityBaseEditor (não PromptConfigForm):** super_admin clica Editar → Dialog max-edit (max-w-900) com Textarea grande (rows 18, max-h-60vh, font-mono) + counter X/5000 + botão "Restaurar padrão" (só se isCustom) + botão "Salvar" disabled quando !dirty || overLimit. Personalidade/Tom/Guardrails seguem na seção Comportamento abaixo (não duplica edição).
- **`PromptConfigForm` aceita `onSaved?: () => void`** — não usado pelo Dialog do PromptPreviewCard em v0.28 (Dialog usa IdentityBaseEditor agora), mas mantido pra outros consumers.

### Playground
- **Input bar = bubble exata:** `<footer>` HTML normal (não `<SheetFooter>` sticky) — Mic externo + inner area unificada (rounded-xl border bg-background) + Send violet gradient. Layout idêntico ao `nex-chat-panel` linhas 631-742.
- **Placeholder "Pergunte ao agente Nex"** (era "Pergunte algo ao Nex").
- **`sendNexMessage` em vez de `testNexPromptAction`:** Playground passa a usar mesmo path da bubble com histórico completo entre turnos. **Qualidade idêntica** (era "uma porcaria" segundo feedback). Trade-off documentado: playground deixa de testar "prompt em edição" (não usa mais cfg do form); usa o prompt do DB direto.
- **Fix Dialog "Ver prompt usado":** pattern Sheet suppress + Dialog z-[70]. Quando user clica "Ver prompt usado", Sheet desaparece (Sheet open && !sheetSuppressed), Dialog abre com z-[70] (content + overlay). Ao fechar Dialog, Sheet reaparece. Toast.error explícito quando action falha (era silencioso em v0.26).

### Bubble
- **AudioPlayer speed tag compacta:** `h-5 min-w-[34px] px-1 text-[9px]` (era h-6 min-w-[44px] px-1.5 text-[11px]). Tag "1.75×" não vaza mais do balão violet. Trade-off: h-5 < 44pt touch target Apple HIG, mas é botão cíclico não-crítico (next-speed) com aria-label dinâmico cobrindo a11y.

### Schema
- **`nex_settings.identity_base TEXT NULL`** — ALTER TABLE ADD COLUMN IF NOT EXISTS (idempotente). NULL preserva back-compat 100%.

### Workflow
- Plan v1 → v2 → v3 com 2 pentes-finos REAIS · subagent-driven-development com TDD em cada task · ui-ux-pro-max em todas as tasks UI.

## [v0.27.0] 2026-05-03 — Conversas Fixes (regressões v0.25 + bug match digits-only)

> 9 fixes em `/relatorios/conversas` reportados pelo João via screenshots após v0.25.0/v0.26.0 LIVE. Workflow rigoroso (plan v1→v2→v3 com 48 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em 4 batches · ui-ux-pro-max em toda task UI · code review final APPROVED_WITH_CONCERNS com 1 issue fixada). 11 commits granulares · 311/311 tests verde nas áreas tocadas · typecheck 0 erros.

### Fixes

- **F1 — Paginação volta a 1000:** `PAGE_SIZE_CLIENT` 100 → 1000 em `conversas-page-client.tsx`. Era 1000 antes da v0.25; reduzi sem pedido — regressão.
- **F2 — Reticências volta na paginação (algoritmo v0.23):** `buildPageItems` retorna `Array<number | "ellipsis">`. Bordas (atual=1 ou N): `[1, ellipsis, N]`. Meio: `[1, ellipsis, page, ellipsis, N]`. Restaurado `<EllipsisDropdown>` que abre Popover com range de páginas. Casos `page=2/4` com `totalPages=5` colapsam a ellipsis adjacente em `[]` (dropdown retorna null — sem duplicação visual com vizinho).
- **F3 — Input busca refator:** removida tag "Filtrando" violet flutuante. Ícone lupa muda cor (`text-muted-foreground` → `text-violet-500` com `transition-colors`) sinaliza filtering state. Botão X (`h-5` + `<X h-3>`) no canto direito do input limpa busca via mouse (Esc preserva). `pr-9` quando ativo, `pr-3` idle.
- **F4 — Match respeita ordem dos caracteres (BUG FIX):** `matchSearchClient` removeu heurística `isPhoneOrDocLike` introduzida na v0.25. Bug reportado: busca "3380" retornava rows com display_id 3803 (mesmos dígitos, ordem diferente) — heurística ativava match digits-only que ignorava ordem. Agora é `haystack.includes(needle)` puro: substring contígua estrita. Trade-off: máscaras divergentes do haystack (ex: `"11 98765-4321"` vs `"+55 (11) 98765-4321"`) deixam de bater. Telefones/documentos cobertos via `phoneVariants`/`documentVariants` (raw + formatPhone + digits) no haystack.
- **F5 — X chips Filtros/Ordenação volta ao estilo fosco (v0.23):** trocou `bg-destructive` sólido + `text-white` + `ring-2` + `scale-110` (overstated da v0.25) por `bg-destructive/15` + `text-destructive` + `border-destructive/40` (vermelho fosco em volta + X vermelho mais vivo). Hover sobe pra `bg-destructive/25` + `border-destructive/60` mantendo `text-destructive`. Tamanho mantém `h-5 w-5` + `<X h-3>`.
- **F6 — Calendar DayButton cursor-pointer:** `<Button>` interno do `CalendarDayButton` ganha `cursor-pointer disabled:cursor-not-allowed aria-disabled:cursor-not-allowed`. Afeta TODOS os calendários da plataforma (period-pills, dashboards, etc.).
- **F7 — Tabela com larguras fixas (BUG FIX):** bug reportado: ao rolar a tabela, colunas mexiam (a partir de Estado/Departamento, todas ficavam um pouco mais à esquerda). Causa: virtualizer monta/desmonta rows; com `table-layout: auto` + `min-w` nas cells, browser recalculava larguras conforme conteúdo das rows visíveis. Fix: `<Table style={{ tableLayout: "fixed", minWidth: "max-content" }}>` + `<colgroup>` com `<col width=Xpx>` por coluna (constante `COLUMN_WIDTHS`). Cells perdem `min-w` (substituído por col); `truncate` + `title` HTML continuam para overflow.
- **F8 — Tour reordena steps + bump conversas-v5:** ordem alvo: period → search → filters-chip → sorting-chip → atalhos → **presets → export** (era export → presets) → columns → pagination-top → table → drill-down → open-action → refresh. Bump `id: "conversas-v5"` força re-show pra usuários que viram v4.
- **F9 — "Chatwoot" → "Nexus Chat" em UI user-facing (escopo limitado):** 3 arquivos do escopo `/relatorios/conversas`:
  - `conversas-table.tsx` OpenIdLink: `title` + `aria-label` agora "Abrir conversa #N no Nexus Chat".
  - `conversas-tour.ts` step `open-action`: title "Abrir conversa no Nexus Chat" + description atualizada.
  - `open-in-chatwoot.tsx`: `aria-label` ajustado.
  - Outros locais (`chatwoot-urls-card`, `audits-table`, `user-form-dialog`, `login-branding`, `stale-banner`) ficam pra release dedicada de rebranding.

### Trade-offs

- **Match v0.27 deixa de bater máscaras divergentes do haystack.** Usuários que digitavam fragmentos com pontuação arbitrária precisam adaptar (digitar substring contígua de algum dos formatos no haystack). Comportamento documentado em JSDoc no `match-search-client.ts`.
- **Tour bump v4→v5** força re-show pra usuários que viram v4 (padrão do projeto).

---

## [v0.26.0] 2026-05-03 — Suite Agente Nex Polish v3

> Polimento dirigido por feedback do super_admin nos 4 submenus do Agente Nex (Configuração, Prompt, Playground, Consumo). Workflow rigoroso (plan v1→v2→v3 com 28 achados em 2 pentes-finos REAIS · subagent-driven-development com TDD em cada task · ui-ux-pro-max em toda task UI · two-stage review automático após cada task). 14 commits granulares (R0+A1+A2+A3 · B1+B2+B3+B4 · C1+C2 · D4+D3+D1+D2+D5) · todos tests verde nas áreas tocadas · typecheck 0 erros · sem schema change destrutivo (apenas ALTER TABLE ADD COLUMN IF NOT EXISTS).

### Configuração (`/agente-nex/configuracao`)

- **Reorg em 4 sections:** Toggle Nex / LLM section + ações inline (Testar conexão + Salvar saíram do final, agora dentro da seção LLM ao lado da chave) / **USD/BRL ticker** novo / Spread cartão em destaque (Card violet `border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10` + helper expandido + Label semântico htmlFor + span "× " aria-hidden + Input min-h-44).
- **`UsdRateTicker` (NOVO):** Card client-side com cotação USD/BRL ao vivo. Recebe `commercialRate`, `spread` (REATIVA — quando user ajusta spread, recálculo `effectiveRate = commercial × spread` no client sem fetch), `source` (live/cache/fallback com cores semânticas emerald/amber/destructive), `fetchedAt` (Date | string). Auto-refresh hourly silencioso via setInterval; refresh manual via botão circular pequeno (h-8 w-8) + Loader2 motion-safe + toast feedback success/error. Tabular-nums no valor; ícone DollarSign violet; tooltip explicativo "Atualiza automaticamente a cada 1 hora".
- **Server Action `getCurrentUsdBrlRateAction`:** super_admin gate (não autenticado / viewer / outros perfis recebem `{ ok: false, error }`); invalida memo via `__resetUsdBrlCache()` + retorna `UsdBrlRate` atualizado. 3 tests TDD.
- **Dialog primitive aceita `overlayClassName?: string`:** prop opcional adicionada em `src/components/ui/dialog.tsx` que propaga pro `<DialogOverlay>` interno via `cn()` merge. Permite override do z-50 default — usado em C2 (Playground "Ver prompt usado" sobe pra z-[60]).

### Prompt (`/agente-nex/prompt`)

- **`IDENTITY_BASE` anti-Chatwoot:** removida menção "(Nexus Chat / Chatwoot)" do header; substituída por "(Nexus Chat)" único. Adicionada regra explícita "**Nunca use 'Chatwoot' nas respostas.** Mesmo que o conhecimento, links ou contexto técnico mencione esse termo, sempre se refira à plataforma como **'Nexus Chat'**. Sem exceções." Adicionada regra de concisão "**Máximo 3 frases por resposta**, salvo se o usuário pedir detalhe explícito." (era prolixo demais segundo feedback). String do `composeSystemPrompt` para `accountUrls` agora rotula "Mapeamento das contas Nexus Chat" (não Chatwoot).
- **Backfill idempotente do guardrail "cite a fonte":** column nova `seeded_v2_at TIMESTAMPTZ` em `nex_settings` (IF NOT EXISTS) + UPDATE condicional que reconstrói o array via `jsonb_array_elements` + `jsonb_agg` filtrando match EXATO `ILIKE '%cite a fonte do número%'` (preserva customizações que mencionem "cite a fonte" em outro contexto — não usa match genérico). Idempotente via `WHERE seeded_v2_at IS NULL` — só roda 1 vez por install. Seed novo (4 itens) também sem "Sempre cite a fonte do número".
- **`PromptPreviewCard` collapse + Editar role-gated:**
  - `<pre>` do prompt completo composto agora fica **oculto por default** — collapse "Ver prompt completo (somente leitura)" com chevron rotacionando.
  - Botão "Maximizar" **REMOVIDO** do header — só Copiar (todos) + Editar (super_admin only).
  - "Editar" abre Dialog max-edit (`max-w-[min(1000px,95vw)]`, `max-h-[90vh]`, ScrollArea interno) com `<PromptConfigForm>` dentro pra editar Personalidade/Tom/Guardrails/Modo manual. Salvar fecha o Dialog via `onSaved` callback.
  - Não-super_admin: vê Copiar + microcopy "Apenas super_admins podem editar." (a página `/agente-nex/prompt` continua redirect-protected pra super_admin; gating no componente é defesa em profundidade pra futuro acesso de outros perfis).
  - `aria-readonly` removido do `<pre>` (atributo inválido em HTML estático).
  - Imports limpos: `Maximize2`, `IDENTITY_BASE` removidos (não usados).
- **`PromptConfigForm` aceita prop `onSaved?: () => void`:** chamada após `router.refresh()` no `handleSave` — permite ao Dialog max-edit fechar automaticamente após save bem-sucedido.
- **Help text dos guardrails:** exemplo "Sempre cite a fonte do número" trocado por "Não simule ações destrutivas".

### Playground (Sheet)

- **`PlaygroundLauncher` destacado:** botão `variant=default` violet primary + ícone Sparkles (era MessageSquare outline) + ring violet sutil (`shadow-sm shadow-violet-600/20 ring-1 ring-violet-400/20 hover:shadow-md hover:shadow-violet-600/30 hover:ring-violet-400/40`) + `min-h-[44px]` (touch target compliance). Recebe `providerKey: LlmProvider | null` canonic além de `providerLabel` pra detecção robusta de OpenAI no PlaygroundSheet (audio gating).
- **`PlaygroundSheet` bubble UX:** input bar refatorada com layout do `nex-chat-panel` — Mic externo idle + inner area unificada (`rounded-xl border border-input bg-background px-3 py-1` + focus-within ring violet) + Send violet gradient (`bg-gradient-to-br from-violet-600 to-violet-500 shadow-md shadow-violet-600/30 h-9 w-9 rounded-xl`). `<AudioRecorder mode="embedded">` controlado por ref + transcribe via `/api/nex/transcribe`. Send dinâmico: idle → submit texto, recording → `recorder.sendNow()`. Mic só renderiza quando `audioInputEnabled && providerKey === "openai"` (não mais string-match em label).
- **`submitMessage(text: string)` único helper:** elimina closure stale do flow de áudio (era bug latente onde `setMessage(text)` + `setTimeout(handleSubmit, 0)` lia state desatualizado). `handleSubmit` antiga **DELETADA** — todo flow passa por `submitMessage`.
- **Fix z-index do Dialog "Ver prompt usado":** agora abre com `className="z-[60]"` E `overlayClassName="z-[60]"` (usa prop nova de R0). Antes ficava POR TRÁS do Sheet (z-50 ambos, Sheet ganhava por ordem de render). Bug crítico identificado pelo super_admin.

### Consumo (`/agente-nex/consumo`)

- **`DonutWithCenter` defaults bumped:** `innerRadius` 60 → 80, `outerRadius` 80 → 120, `height` 320 → 360. Mais respiro entre fatia e texto central; ratio 0.66 mantém leitura. ConsumoContent passa a usar defaults (remove override de `height={300}` + prop deprecated `tooltipPosition="top-right"` — tooltip near-mouse default já cobre).
- **Total no filtro destaque:** linha sticky agora `bg-violet-500/5 dark:bg-violet-500/10` (era `bg-muted/30`) + `font-bold` (era `font-semibold`) + `text-sm` (era `text-xs uppercase tracking-wide`) + `border-border/60` (era /40 — invisível em dark). Visualmente 1pt maior + cor violet sutil destaca a linha de totais.
- **`CustomBarTick` case-mixed:** badge SVG do provider agora usa case-mixed (OpenAI/Anthropic/Gemini/OpenRouter) — sem `.toUpperCase()`. Largura recalculada `length * 6 + 14` (case-mixed ocupa mais px que all-caps); `letterSpacing` 0.3 (era 0.5 — apertado em case-mixed); `opacity` 0.7 (era 0.6 — mantém WCAG 4.5:1).
- **`PROVIDER_LABELS["gemini"]`:** "Google Gemini" → "Gemini" (alinha com como a marca Google se apresenta no produto). Atualiza também `PROVIDER_CATALOG.gemini.label` em `catalog.ts`.
- **`transcribe.ts` log do fallback:** `console.warn` agora inclui `errorBody.slice(0, 200)` do response body do gpt-4o-mini-transcribe quando cai pro whisper-1. Permite debug em prod (motivo do fallback: model_not_available, rate limit, auth, etc) sem precisar repro local. Tooltip do header da tabela explicando "Whisper (transcrição) é cobrado por minuto. Tokens não se aplicam a chamadas de áudio." mantido (resposta direta ao "por que whisper-1 não retorna tokens?").

### Workflow rigoroso

- Plan v1 → v2 → v3 com 2 pente-finos reais (28 achados aplicados, não cosméticos).
- subagent-driven-development com TDD em cada task UI/lógica.
- ui-ux-pro-max obrigatória em todas as tasks UI (mesmo "ajustes pequenos").
- Two-stage review automático após cada task: spec compliance → code quality.

## [v0.25.0] 2026-05-03 — Conversas Polish + busca client-side global

> 7 ajustes em `/relatorios/conversas` (6 polish + busca client-side global) + 1 bug fix descoberto durante a release (HighlightedText sem normalize de acentos). Workflow rigoroso (plan v1→v2→v3 com 28 achados em 2 pentes-finos reais · subagent-driven-development com TDD em todas as tasks · ui-ux-pro-max em toda task UI · code review final). 16 commits granulares · 298/298 tests verde nas áreas tocadas · typecheck 0 erros · sem schema change.

### Mudanças (Conversas)

- **Busca client-side global (opção B alinhada com João):** `search` saiu dos `reportFilters` que iam pra SQL (causava quebra quando o Chatwoot estava stale e cada keystroke revalidava cache). Agora é state local em `ConversasPageClient` que filtra rows hidratadas via `matchSearchClient` — algoritmo OR sobre 11 campos (`display_id` ±#, `contact.name`, telefone com/sem máscara, identifier CPF/CNPJ com/sem máscara, inbox/team/assignee, status pt-BR, prioridade pt-BR, `labels[].name`, `custom_attributes` ignorando keys com `_`). Normaliza acentos via NFD + remove combining marks (`\p{Mn}/gu`). Esc limpa busca (preventDefault contra Safari nativo). URL `?q=` é hidratada na montagem (preserva URLs antigas) mas não volta pra URL após mudanças (efêmera). Performance medida: 50k rows < 2s no jest paralelo. Cap defensivo de 50.000 conversas por período — banner amarelo informativo quando ultrapassa (não bloqueia). `pageSize` da query SQL bumpado de 1.000 → 50.000; `MAX_LIMIT` em `conversas-list.ts` de 10k → 50k; clamp interno paralelo bumpado de 5k → MAX_LIMIT (era cap silencioso). Cache key Redis ficou estável durante busca.
- **HighlightedText normaliza NFD (bug fix):** busca "joao" agora destaca "João" (antes encontrava match mas não pintava porque `lowercase` só não cobre acentos). Implementação via `buildIndexMap` walk char-a-char construindo map (normalizedIdx → originalIdx) — preserva acentos no render. Known limitation: surrogate pairs (emoji) podem não destacar 100% (raro em dados pt-BR).
- **SORT_OPTIONS exporta + adiciona Documento:** ordenar via header da coluna "Documento" mostrava chip com label `document` (em inglês) porque `sortOptions` do `AppliedFiltersChips` não encontrava entry e usava `rule.key` como fallback. Fix: `{ key: "document", label: "Documento" }` em SORT_OPTIONS posição 2 (após Nome).
- **Etiquetas no chip sem `(N)`:** "Etiquetas (4): hg +3" → "Etiquetas: hg +3" usando `summarize()` — segue padrão Caixa de entrada / Departamento / Atendente / Status / Prioridade.
- **Sort dialog "Adicionar critério" sem coluna pré-selecionada:** `addRule()` agora cria `{ key: "", direction: "asc" }` (era `available[0]!.key`). `<CustomSelect>` mostra placeholder "Selecione uma coluna". Botão Aplicar desabilitado se algum critério tem `key === ""`. Anti-dup ignora `""` explicitamente. React `key` do `<li>` inclui `idx` para evitar colisão quando múltiplos rules vazios coexistem.
- **X destrutivo nos chips Filtros/Ordenação:** `h-5 w-5` (era 4×4) + ícone `h-3 w-3` (era 2.5); idle igual; hover ganha `bg-destructive`, `text-white`, `ring-2 ring-destructive/30`, `ring-offset-1 ring-offset-card`, `scale-110`. Visual sólido conforme imagem 3 do feedback.
- **Cursor pointer global na seção Conversas:** `cursor-pointer` em todos os buttons clicáveis de `period-pills`, `Calendar` (day + button_previous/next), `conversas-pagination`, `sorting-dialog`, `applied-filters-chips`, `filters-dialog`, `filter-chip-list-popover`, `quick-filters-popover`, `presets-popover`, `conversas-table` headers, `conversa-drill-down`, `columns-toggle`, `export-button`. `disabled:cursor-not-allowed` nos disabled. Padroniza affordance visual.
- **Paginação simplificada:** `[1, "...", page, "...", N]` → `[1, page, N]` direto (sem reticências quando atual no meio). Atual no meio continua sendo Popover dropdown que abre lista 1..N. Bordas (`atual=1` ou `N`): `[1, N]`. `<EllipsisDropdown>` + `rangeToPages` deletados (mortos). Tipo do retorno: `number[]`.

### Internal

- `src/lib/reports/match-search-client.ts` (novo): `normalize`, `buildHaystack`, `matchSearchClient` exports + 16 sanity tests TDD (incluindo perf 50k rows). Heurística `isPhoneOrDocLike` ativa match digits-only quando needle parece telefone/doc (resolve `"11 98765-4321"` que o algoritmo do plan literal não cobriria).
- `src/lib/chatwoot/conversas-search.ts` marcado `@deprecated` (preserva tests existentes; helper não é mais chamado).
- `ConversasPageClient` props simplificadas: removidas `total/page/pageSize/totalPages` (paginação agora é UI client). State local `searchClient` (string) + `pageClient` (number) com reset `pageClient=1` quando search/filters/sort/quickFilters mudam.
- `ConversasTable` ganha pipeline derivado: `match (searchClient) → conditionGroup → sort → slice por página`. Counter "Mostrando X-Y de Z" reflete `totalFiltered`. `safePage` clamp `[1, totalPages]` evita página fantasma. Empty state adaptativo com "limpe a busca" quando search ativa.
- `<AdvancedFilters>` input `value/onChange` ligados a prop `searchClient/onSearchClientChange`. Esc limpa via `preventDefault`. Badge "↵ Enter" trocado por indicador "Filtrando" violet condicional (busca virou instantânea — Enter não faz mais sentido).
- `<ExportButton>` ganha prop `searchClientActive?: boolean` + `title` HTML "A exportação inclui os filtros aplicados, não a busca atual" quando ativa. `rowCount` recebe `initialRows.length` (count do período) — não desabilita falsamente quando search zera filtro client.

### Trade-offs

- TTFB primeira carga em "Todos" populado pode subir de ~500ms (1k rows) para 5-10s (50k rows + JOINs). Cache Redis 30s amortiza.
- URL `?q=` é hidratada na montagem (compatibilidade com URLs antigas) mas não volta pra URL após mudanças. Search é efêmera/local.
- Export ignora a busca client-side (mantém comportamento server-side com filtros aplicados). Tooltip clarifica.

---

## [v0.24.0] 2026-05-03 — Suite Agente Nex Polish v2

> Polish dirigido por feedback do super_admin (após v0.20.0 LIVE): remove tela de empty state que escondia o dashboard, donut volta espessura original com tooltip near-mouse, bar tag estilo Badge sem cor, linha total mais sutil + setinha hover indica clicabilidade, cotação tooltip explicativo, Whisper nota refinada citando legado, input bar layout estável, AudioPlayer speed button respeita margem. Spec v3 (25 achados pente-fino) + plan v3 (9 tasks TDD) + ui-ux-pro-max em todas tasks UI.

### A. Consumo do Agente Nex

- **EmptyConsumoState removido**: `/agente-nex/consumo` agora SEMPRE renderiza dashboard zerado (KPIs "0", gráficos com `EmptyChartState` existente, tabela com "Nenhuma chamada no período."). Tela "Ir para Configurações" deletada — escondia o dashboard inteiro mesmo quando usuário só queria ver as métricas.
- **Donut espessura padrão**: `outerRadius` 80 (era 88) + `innerRadius` 60 (era 70) — anel volta à espessura visualmente similar a antes da v0.20. Centro do donut ganha `px-6` para respiro horizontal dos textos.
- **Donut tooltip near-mouse**: removido `position={{x:0,y:0}}` + `wrapperStyle` fixos. Tooltip agora segue o cursor (default Recharts) com `offset={12}` — não fica mais fixo no canto top-right longe do mouse. `allowEscapeViewBox` mantido para preservar tooltip dentro da tela. Prop `tooltipPosition` marcada `@deprecated` (no-op) para back-compat.
- **Bar chart Badge SVG**: tag de provider abaixo do nome do modelo agora é Badge estilo (rect transparent + stroke currentColor opacity 0.3 + text uppercase opacity 0.6 fontSize 9 letterSpacing 0.5) — substitui o `(OpenAI)` entre parênteses anterior. Largura calculada dinamicamente (`label.length * 5.5 + 12`).
- **Linha total sutil**: trocada de `bg-violet-500/15 + border-y-2 violet + bold + Sigma + (N)` para `bg-muted/30 + border-b border-border/40 + text-xs uppercase font-semibold` com label "Total no filtro" puro (sem ícone, sem contagem). Visual integrado com headers secundários da plataforma.
- **Setinha hover indica clicabilidade**: linhas clicáveis ganham class `group` + `<ChevronRight>` `opacity-0 group-hover:opacity-60 absolute` na first cell — usuário vê visualmente que pode clicar para abrir o drill-down.
- **Cotação USD→BRL tooltip explicativo**: span com `cursor-help underline-offset-2 underline decoration-dotted` + `title` HTML explicando AwesomeAPI cache 4h + spread cartão aplicado.

### B. Bubble do Agente Nex

- **Whisper nota refinada**: drill-down de chamada `whisper-1` cita "(legado)" + redireciona para `gpt-4o-mini-transcribe` (v0.20+) + aponta runbook `agente-nex-audio-e-kb-url.md`.
- **Input bar layout estável**: hint "Enter envia · Shift+Enter quebra linha" agora usa `invisible` (não `null`) na transição idle ↔ gravando — preserva altura do container, elimina reflow (componente não treme mais para baixo/cima).
- **AudioPlayer speed button respeita margem**: `min-w-[44px]` no botão acomoda todos os labels (1×, 1.25×, 1.5×, 1.75×, 2×) sem stretch — não vaza mais pra fora do balão violet.

### Notas técnicas
- 1311 testes PASS (20 falhas pré-existentes em `integrations-power-bi.test.ts` não relacionadas).
- typecheck 0 erros.
- Sem mudança de schema.
- 6 commits da release (T1+T4 / T2 / T3 / T5 / T6 / T7).

## [v0.23.0] 2026-05-03 — Conversas Polish (busca funciona, single-day fix, paginação no topo, badge Enter, X adesivo, sorting anti-dup, highlight)

> Pacote consolidado de polimento + 3 bugs críticos no `/relatorios/conversas`. Workflow rigoroso (spec v1→v2→v3 com 25+33 achados de pente-fino + plan v1→v2→v3 com 20+18 achados + ui-ux-pro-max em todas tasks UI). 19 ajustes do super_admin.

### Bug fixes críticos

- **Busca volta a funcionar**: `page.tsx` agora passa `search` no `reportFilters` (era descartado).
- **Single-day filter (21/03 → 21/03) retorna conversas do dia** (era 0). Fix em `datetime-core.ts case "custom"` usa `parseISO` para extrair Y/M/D em UTC e construir 00:00/23:59:59.999 local SP.
- **Sorting anti-duplicação**: critério N não mostra mais colunas já usadas em critérios anteriores.

### Implementação

- **Badge ↵ Enter inline** (estilo Command+K) substitui hint span que quebrava layout ao digitar (lupa + botões adjacentes não descem mais).
- **Highlight visual em violet** das matches da busca em todas colunas + drill-down (substring contains, case-insensitive).
- **Paginação no TOPO da tabela** com formato "Mostrando X-Y de Z conversas".
- **ConversasPagination novo algoritmo simplificado**: 1, 1-2, 1-2-3, 1-2-3-4, 1...N (atual=1 ou N), 1...mid...N. Reticências viram dropdown clicável (lista páginas do range). Atual no meio tem chevron + dropdown 1..N com check na atual.
- **FiltersDialog**: seções iniciam fechadas; "Limpar todos" zera SÓ filtros, mantém modal aberto, não toca período/ordenação; header dinâmico "Filtros simples" / "Filtros avançados".
- **X "adesivo"** na quina superior direita dos chips "Filtros · N" e "Ordenação · N" (remove lixeirinhas separadas no toolbar).
- **Calendar padrão da plataforma**: defaultMonth=today (era março/2025) + tamanho fonte text-xs (afeta TODAS as 8+ telas que usam `<PeriodPills>`).
- **Tour `conversas-v4`** ganha step "Total + paginação".

### Compat

- ?page=N na URL (já existia desde v0.19).
- search ainda em ?q=N na URL.
- Toda a lógica de busca server-side (ILIKE) já existia desde v0.17 — só faltava o plumbing.

## [v0.22.0] 2026-05-02 — Dashboard Polish

> Polish dirigido por feedback do super_admin (após v0.20.0 LIVE): remove tela de empty state que escondia o dashboard, donut volta espessura original com tooltip near-mouse, bar tag estilo Badge sem cor, linha total mais sutil + setinha hover indica clicabilidade, cotação tooltip explicativo, Whisper nota refinada citando legado, input bar layout estável, AudioPlayer speed button respeita margem. Spec v3 (25 achados pente-fino) + plan v3 (9 tasks TDD) + ui-ux-pro-max em todas tasks UI.

### A. Consumo do Agente Nex

- **EmptyConsumoState removido**: `/agente-nex/consumo` agora SEMPRE renderiza dashboard zerado (KPIs "0", gráficos com `EmptyChartState` existente, tabela com "Nenhuma chamada no período."). Tela "Ir para Configurações" deletada — escondia o dashboard inteiro mesmo quando usuário só queria ver as métricas.
- **Donut espessura padrão**: `outerRadius` 80 (era 88) + `innerRadius` 60 (era 70) — anel volta à espessura visualmente similar a antes da v0.20. Centro do donut ganha `px-6` para respiro horizontal dos textos.
- **Donut tooltip near-mouse**: removido `position={{x:0,y:0}}` + `wrapperStyle` fixos. Tooltip agora segue o cursor (default Recharts) com `offset={12}` — não fica mais fixo no canto top-right longe do mouse. `allowEscapeViewBox` mantido para preservar tooltip dentro da tela. Prop `tooltipPosition` marcada `@deprecated` (no-op) para back-compat.
- **Bar chart Badge SVG**: tag de provider abaixo do nome do modelo agora é Badge estilo (rect transparent + stroke currentColor opacity 0.3 + text uppercase opacity 0.6 fontSize 9 letterSpacing 0.5) — substitui o `(OpenAI)` entre parênteses anterior. Largura calculada dinamicamente (`label.length * 5.5 + 12`).
- **Linha total sutil**: trocada de `bg-violet-500/15 + border-y-2 violet + bold + Sigma + (N)` para `bg-muted/30 + border-b border-border/40 + text-xs uppercase font-semibold` com label "Total no filtro" puro (sem ícone, sem contagem). Visual integrado com headers secundários da plataforma.
- **Setinha hover indica clicabilidade**: linhas clicáveis ganham class `group` + `<ChevronRight>` `opacity-0 group-hover:opacity-60 absolute` na first cell — usuário vê visualmente que pode clicar para abrir o drill-down.
- **Cotação USD→BRL tooltip explicativo**: span com `cursor-help underline-offset-2 underline decoration-dotted` + `title` HTML explicando AwesomeAPI cache 4h + spread cartão aplicado.

### B. Bubble do Agente Nex

- **Whisper nota refinada**: drill-down de chamada `whisper-1` cita "(legado)" + redireciona para `gpt-4o-mini-transcribe` (v0.20+) + aponta runbook `agente-nex-audio-e-kb-url.md`.
- **Input bar layout estável**: hint "Enter envia · Shift+Enter quebra linha" agora usa `invisible` (não `null`) na transição idle ↔ gravando — preserva altura do container, elimina reflow (componente não treme mais para baixo/cima).
- **AudioPlayer speed button respeita margem**: `min-w-[44px]` no botão acomoda todos os labels (1×, 1.25×, 1.5×, 1.75×, 2×) sem stretch — não vaza mais pra fora do balão violet.

### Notas técnicas
- 1311 testes PASS (20 falhas pré-existentes em `integrations-power-bi.test.ts` não relacionadas).
- typecheck 0 erros.
- Sem mudança de schema.
- 6 commits da release (T1+T4 / T2 / T3 / T5 / T6 / T7).

## [v0.22.0] 2026-05-02 — Dashboard Polish

> Pacote consolidado de polish do `/dashboard` dirigido por feedback visual + bugs reais de dados. Workflow rigoroso (spec v1→v2→v3 com 22 achados em 2 pente-finos + plan v1→v2→v3 com 18 achados + subagent-driven-development com TDD por task + ui-ux-pro-max em todas as tasks UI). 9 commits granulares · 34 testes novos · typecheck verde · suite com 1284 passing (20 falhas pré-existentes em `integrations-power-bi.test.ts` — escopo do agente paralelo).

### A. PeriodNavigator tag-style (G1)

- **Tipografia maior**: `text-[11px]` → `text-sm font-medium`, igualando padding e fonte das checkboxes Recebidas/Abertas/Resolvidas/Pendentes.
- **Botões maiores**: `h-5 w-5` → `h-7 w-7`; chevrons `h-3 w-3` → `h-4 w-4`.
- **Container**: `px-0.5 py-0.5` → `px-2 py-1.5 rounded-lg`. Border violet 50% → 30% (mais sutil, hover compensa).
- **Acessibilidade**: roles, aria-labels, focus-visible mantidos.

### B. KPIs do topo no padrão consumo (G3, G4)

- **Layout reorganizado** (`KpiClickableCard`): label UPPERCASE em cima (era pequeno embaixo do valor), valor `text-2xl` → `text-3xl font-bold tabular-nums`, trend abaixo do valor (era top-right), subtitle "no período" muted abaixo do trend, ícone top-right (era top-left). Sparkline + hover "ver detalhes" + click handler preservados.
- **min-h** `7rem` → `8rem` (acomoda label+valor+trend+subtitle+sparkline).
- **Prop nova `subtitle`**; legacy `sublabel` mantida como fallback (compat).
- **`dashboard-content.tsx`**: 4 KPIs migrados para `subtitle="no período"`.

### C. Drill-downs alinhados (G4, G8)

- **Renomear "Inbox" → "Estado"** em headers/títulos/descrições da UI (Recebidas, Resolvidas, Status, By-Team, Sem-resposta). Campos internos (`inboxName`, `byInbox`) mantidos por escopo — refactor server-side seria over-engineering.
- **Coluna "Departamento"** adicionada entre "Estado" e "Atendente" em todas as tabelas de drill-down (5 contextos). Backend ganha JOIN: `LEFT JOIN teams t ON t.id = c.team_id`. Tipos `DrillDownConversationItem`, `NoResponseDrillDownItem`, `ByTeamDrillDownItem` ganham `teamName: string | null`.
- **Tag âmbar pill** na coluna "Quando" / "Esperando há" / "Última atividade" (consistência com `no-response-card`).
- **`<TotalBadge n>`** novo (`src/components/dashboard/total-badge.tsx`) — pill violeta com número formatado pt-BR. Usado nos títulos das seções de tabela em todos os drill-downs (substitui "X no total" cosmético e "(N)" entre parênteses).
- **Distribuição por estado**: `yAxisWidth` 120 → 160 e altura proporcional `Math.max(280, Math.min(480, count * 28 + 60))` — todos os labels visíveis sem pular.
- **Distribuição por hora**: labels do XAxis viram só "HH:00" (sem "HH:00 – HH:59" no name; janela completa fica documentada na description).
- **`min-w` da tabela**: 720px → 820px (acomoda nova coluna).
- **`DrillDownSection.title`** estendido para aceitar `ReactNode` (era `string`) — permite TotalBadge inline no título.

### D. Drill-down "Conversas sem resposta" (G5, G6, G7)

- **Faixa de espera** (G6): `<WaitingBucketsDonut>` novo substitui o card "Resumo / Snapshot atual". 4 buckets fixos (0–4h yellow, 4–24h amber, 1–3 dias orange, mais de 3 dias red) calculados client-side a partir de `items[].waitingSeconds`. Centro mostra `total`, abaixo "Mais antiga há …" condicional.
- **Bugfix de contagem (G5)**: widget mostrava 31 conversas e drill-down mostrava 11 — divergência de definição. `getNoResponseDrillDown` passa a usar `c.last_activity_at` ∈ período + filtro `WHERE m.message_type IN (0, 1)` no `last_msg` CTE, alinhando exatamente com `dashboardData.noResponse`. Cache key bumpada (`-v2`).
- **Tabela** (G7): coluna "Última msg" removida (redundante com "Esperando há"); coluna "Departamento" adicionada; "Inbox" → "Estado"; tag âmbar pill em "Esperando há"; toggle Inbox/Atendente → Estado/Atendente (state interna `groupBy` preservada por compat).

### E. Investigação G2 (chart Semana/Mês inconsistente com Dia)

- **Sanity tests** (`fill-buckets.test.ts`): 7 testes provam que matching de bucket key entre SQL UTC (`date_trunc … AT TIME ZONE`) e cliente (`Intl.DateTimeFormat en-CA timeZone tz`) é correto pra granularity=hour e =day em America/Sao_Paulo. **INVARIANT**: soma horária == agregado diário (12 conversas distribuídas em 12 horas == 1 bucket diário com 12).
- **Diagnostic logging** server-side em `dashboardData()`: captura `accountId`, `granularity`, `range`, `chartLen`, primeiro/último bucket, soma de received, KPI received. Persiste em produção pra futuro diagnóstico.
- **Conclusão honesta**: sem acesso ao banco real, análise estática + 7 sanity tests indicam que client-side é matemático correto. Se a divergência persistir em produção, o bug é server-side (cache stale ou query SQL diferente). **Hotfix v0.22.1** após análise dos logs em produção.

### F. Cache keys bumpadas

- `dashboard-drill-received-v3` → `-v4`
- `dashboard-drill-resolved-v3` → `-v4`
- `dashboard-drill-status-v3` → `-v4`
- `dashboard-drill-no-response` → `-v2`
- `dashboard-drill-by-team` → `-v2`

### Notas técnicas

- **Sem schema change** (apenas JOINs adicionais sobre tabelas existentes em SELECT).
- **34 testes novos**: 4 (TotalBadge) + 4 (WaitingBucketsDonut) + 4 (PeriodNavigator) + 6 (KpiClickableCard) + 4 (drill-down-contents smoke) + 5 (no-response-drill-down) + 7 (fill-buckets sanity).
- **Coordenação multi-agente**: zero conflito com `claude-empresa-ativa-global` (v0.21.0 LIVE) e `claude-nex-suite-polish-v020` (v0.20.0 LIVE). Não toquei `dashboard/page.tsx`, `src/components/charts/*`, `src/components/agente-nex/*`, `src/lib/nex/prompt.ts`. Bump intencional 0.20 → 0.22 (pulo v0.21).
- **Coordenação dentro da release**: 9 subagents fresh em sequência (T1 → T2 ‖ T3 ‖ T5 → T4 → T6 ‖ T7 ‖ T8 → T9), TDD por task, `ui-ux-pro-max` invocada antes de cada task UI.

## [v0.21.0] 2026-05-02 — Empresa Ativa Global (auditoria + 3 tools Nex + contexto)

> Tornar o `AccountSwitcher` do sidebar a fonte ÚNICA e GLOBAL de escopo. Workflow rigoroso (spec v1→v2→v3 com 13+12 achados em 2 pente-finos + plan v1→v2→v3 com 15 achados + subagent-driven-development com TDD). 11 commits granulares · 15 testes novos · typecheck verde · code review autônomo APROVADO.

### A. Hardening do helper `getActiveAccountId`

- **`getActiveAccountId(user)`** — assinatura nova, recebe `AuthUser`, valida via `getAccessibleAccountIds`, devolve a **primeira conta permitida** (fail-closed) em vez do antigo `DEFAULT_ACCOUNT_ID=9` hardcoded. Lança `NoAccessibleAccountError` quando o user não tem nenhuma conta acessível. Envolto em `cache()` do React → dedupe por request RSC.
- **Layout DRY** — `(protected)/layout.tsx` deixa de duplicar a lógica de fallback (cookie → DEFAULT 9 → first → 9) e passa a chamar o mesmo helper das pages. Captura `NoAccessibleAccountError` → `redirect("/login?reason=no-access")`.
- **`assertAccountAccess` em todas as 8 pages** que leem o helper (dashboard + 7 relatórios) — defense in depth: 5 camadas (cookie HttpOnly + helper + assertAccountAccess + WHERE account_id + chatwoot_readonly somente SELECT).

### B. Tools introspectivas do Agente Nex (read-only, sem secrets)

- **`get_active_company`** — devolve `{ id, name, platformRole, companyRole, isOwner }` da empresa ativa. Fallback gracioso "Empresa #N" quando o ID não é conhecido.
- **`get_integrations_status`** — devolve `{ kindCounts: { power_bi: { total, active, errored, disabled, lastSyncAt? } } }` filtrado por `accountIdFilter`. **Gating**: `lastSyncAt` só populado para `super_admin` (managers/viewers só veem contadores agregados).
- **`get_nex_config_summary`** — devolve `{ provider, model, kbEnabled, kbDocsCount, audioInputEnabled, audioEffectivelyEnabled, bubbleEnabled, nexBubbleVisibility, reportsVisibility }`. **NÃO** retorna chaves, tokens ou URLs internas.
- **`buildActiveCompanyContext`** — novo helper em `src/lib/llm/agent/active-company-context.ts` injeta bloco "═══ CONTEXTO ATIVO ═══" no system prompt do Nex via `run-nex.ts` (não toca `prompt.ts` — coordenação multi-agente com `claude-nex-suite-polish-v020`). Inclui nome da empresa + accountId + identidade do user (se passada) + inventário das 3 tools novas.
- **Executor com `platformRole`** — assinatura `executeTool(name, args, accountId, excludeMatrixIA, platformRole)` propagada de `runNexAgent` para habilitar gating por role nas tools novas.

### C. Documentação canônica

- **Runbook `docs/runbooks/escopo-por-empresa.md`** — tabela das 22 surfaces (per-company / global / super_admin / per-user), invariantes para qualquer novo caller (`getCurrentUser → getActiveAccountId → assertAccountAccess → query`), comando de auditoria contínua (`comm -23 ...`), inventário das 3 tools introspectivas, follow-ups identificados no code review (companyRole/isOwner/nexBubbleVisibility stubs, errorCode em nex-chat).
- **Spec + plan + pente-finos** — `docs/superpowers/specs/2026-05-02-empresa-ativa-global-design.md` (v3), `docs/superpowers/plans/2026-05-02-empresa-ativa-global.md` (v3) com versões intermediárias commitadas para auditoria.

### Notas técnicas

- **Sem schema change**. Cookie `nexus_active_account` mantido (mesmo nome, mesmo shape).
- **15 testes novos** — 5 cenários de `getActiveAccountId` (cookie ausente/válido/inválido/proibido/sem-conta); 4 cenários de `buildActiveCompanyContext` (nome+ID, fallback, user line, falha graciosa); 6 cenários das tools (shape, gating super_admin, sem secrets, audio condicional).
- **Coordenação multi-agente** — `claude-nex-suite-polish-v020` (v0.20.0 LIVE) tocou `prompt.ts` + `prisma/schema.prisma`; eu evitei esses arquivos. `claude-conversas-v019` (v0.19.0 LIVE) tocou `relatorios/conversas/page.tsx`; toquei só ao fim depois de >30min sem atividade. `claude-dashboard-polish-v022` (v0.22.0 em curso) declarou compatibilidade.
- **Code review autônomo APROVADO** — 11/12 itens da spec entregues; 12º (release C2) é a própria entrega. 0 BLOCKING, 3 IMPORTANT (limitações de schema documentadas como follow-ups), 7 NIT.

## [v0.20.0] 2026-05-02 — Suite Agente Nex Polish

> Polish dirigido por feedback do super_admin (após v0.16.0 LIVE): Whisper tokens reais via gpt-4o-mini-transcribe, gráficos com modo "menor que zero", linha total destaque, prompt menos prolixo, Maximize via Dialog, chaves com logos SVG e botão limpo, filtro global de Provider em Consumo. Spec v3 (49 achados pente-fino) + plan v3 (14 tasks TDD) + ui-ux-pro-max em todas tasks UI.

### A. Consumo do Agente Nex

- **Whisper → gpt-4o-mini-transcribe** (50% mais barato, $0.003/min vs $0.006/min): retorna tokens reais (`usage.input_token_details.audio_tokens` + `output_tokens`). Fallback silencioso para `whisper-1` em qualquer 4xx/5xx. Histórico mostra tokens reais para chamadas novas; legado `whisper-1` continua com "—" + nota explicativa.
- **Linha total destaque**: `bg-violet-500/15 + border-y-2 border-violet-500/40 + font-bold` + ícone Sigma + label "Total no filtro" uppercase + colspan=3.
- **Y-axis "menor que zero"**: gráficos com max < R$ 0,01 mostram apenas 2 ticks ("R$ 0,00" e "< R$ 0,01") — evita poluição visual com vários "R$ 0,00". Tooltip preserva valor real.
- **Donut +10% / fonte central -10%**: outerRadius 80→88 + valor central text-2xl→text-xl. Evita sobreposição quando o número aumenta.
- **Filtro global de Provider** ao lado do PeriodPills (`<CustomSelect>`): default "Todos". Mudar afeta KPIs + 3 gráficos + sincroniza filtro inicial da tabela "Histórico de chamadas" (mas tabela permite override manual). URL state shareable (`?provider=openai`).
- **Bar chart "Custo por modelo"**: nome do modelo + tag "(Provider)" abaixo (fonte menor + opacity 0.6) — facilita identificação visual.
- **PageSize CustomSelect**: dropdown "25/50/100 por página" agora usa o componente da plataforma (não `<select>` HTML nativo).

### B. Prompt do Agente Nex

- **PromptPreviewCard**: banner italic "Preview somente leitura" + botão "Editar" (scroll para form). `<pre>` com cursor-text + aria-readonly. Layout fix overflow `<pre>` (min-w-0 + ScrollArea overflow-x-hidden).
- **IDENTITY_BASE radicalmente enxuta** (~14 linhas, 1063 chars vs ~3000 antes): postura curta, sem se apresentar a cada turno, sem citar jargão técnico interno (dashboard summary, query_*, snapshot). Lista de proibição (ChatGPT/GPT/Claude/Gemini/OpenAI/Anthropic/Google) preservada. Nova asserção `length < 1500` (anti-regressão).
- **Personality + Tom default seedados** (idempotente via `seeded_defaults_at`): "Direto, prático, prefere bullets curtos..." + "Profissional e objetivo, em pt-BR. Usa 'você'. Sem se desculpar...". Não sobrescreve customizações.
- **Modo manual** renomeado e tooltip explicativo (era "Modo override avançado"). AlertDialog de ativação avisando que desativa identidade fixa + URLs públicas.
- **"Mostrar identidade fixa"** renomeado para "Ver identidade fixa do agente (somente leitura)" + parágrafo explicativo.
- **Maximizar via Dialog** centralizado (max-w 900px max-h 85vh) — substitui Sheet lateral. Botão "Editar prompt" no header fecha + scrolla.
- **KB**: atalho "Adicionar API Chatwoot (sugerida)" removido. KbUploadDialog mantém aba URL — usuário adiciona manualmente.

### C. Chaves de API

- **Botão "Nova chave" sem gradient**: variant="default" puro (consistente com restante da plataforma).
- **Lógica condicional 0/≥1 chaves**: provider sem credenciais → botão só dentro do empty state (header limpo); provider com credenciais → botão só no header.
- **Logos SVG dos 4 providers**: OpenAI / Anthropic / Google Gemini / OpenRouter — substituem as iniciais. SVG inline com `currentColor` (light/dark friendly). Fontes: OpenAI Lobe Icons mono; demais simple-icons.

### Notas técnicas

- `gpt-4o-mini-transcribe`: `output_tokens` pode vir 0 (bug conhecido da OpenAI) — primário é `input_token_details.audio_tokens`. Custo equivalente ~$0.003/min.
- `composeSystemPrompt` aceita `accountUrls` (de v0.16.0) — preview client-side da página `/agente-nex/prompt` carrega via `listChatwootAccountUrls`.
- `getUsageStats` aceita `provider?: string` — pattern `($N::text IS NULL OR provider = $N)` em todas as 4 queries internas.
- ProviderIcons em `src/components/icons/providers/` (4 arquivos + index helper `getProviderIcon`).
- 1235 testes verde (excluindo 20 falhas pré-existentes em integrations-power-bi.test.ts de outra release).
- Schema sem mudanças (apenas seed adicional em `ensure-tables.ts` runtime).

## [v0.19.0] 2026-05-02 — Conversas Polish (paginação 1k + drill-down + filtros UX + calendar fix)

> Pacote consolidado de polimento + hotfixes em /relatorios/conversas, derivado dos screenshots do super_admin. Workflow rigoroso (spec v1→v2→v3 com 30+18 achados de pente-fino + plan v1→v2→v3 com 20+33 achados + ui-ux-pro-max em todas as tasks UI). 8 ajustes diretos.

### Implementação

- **Paginação clássica numerada** (1.000-em-1.000) com indicador "Total: X conversas · página N de M". Substitui cursor pagination + banner amarelo "Mostrando primeiras 10.000" + bug `page.tsx` que não passava `limit` (caía em DEFAULT_LIMIT=50). URL ?page=N. Setinhas + páginas + elipsis automática (1 … 5 6 7 … 12). count(*) paralelo no backend.
- **Drill-down visual mais limpo**: border-l violet sutil + animação fade-in 200ms + sempre todos atributos visíveis (cap defensivo 200 com nota "+N atributos não exibidos" no caso patológico). Remove botões "Ver mais"/"Recolher".
- **Busca não dispara mais "filtro pendente" no draft**: banner pendente exclui search; hint sutil "Aperte Enter para buscar" abaixo do input quando há texto não aplicado.
- **Skip-link "Pular para a tabela"** some visualmente (mantém anúncio screen reader via `sr-only`).
- **Chips +N expansíveis**: chips com 2+ items (Caixa de entrada, Departamento, Atendente, Etiquetas, Status, Prioridade) viram Popover clicável com lista vertical + X individual + "Remover todos" + animação zoom-in 150ms + aria-haspopup="dialog".
- **X dos chips mais destacado**: hover destrutivo (`bg-destructive/15 text-destructive`); ícone aumentado (h-3.5 w-3.5).
- **Calendar `showOutsideDays={false}`** (fix do bug em PeriodPills) — afeta todas as 8+ telas que usam `<PeriodPills>` (conversas, agente-nex/consumo, distribuicao, equipe, origem-ia, performance, visao-geral, mensagens-nao-respondidas) — fix de plataforma.
- **minDate reseta** quando troca conta no sidebar (re-fetch da primeira conversa da conta no próximo open do picker).
- **Tour `conversas-v3`** ganha step "Atalhos rápidos" + bump de id (re-onboarding 1x).

### Compat

- `?page=N` na URL (omitido se 1).
- `pageSize` fixo 1000 (não persiste).
- Filtros mudam → reset page=1 (pushUrl zera page automaticamente).
- Export ignora page (sempre exporta tudo, até 50k).
- `conversasList(cursor: ...)` continua funcionando para `exportConversasAction` (modo cursor preservado).

### Notas

- count(*) com search ILIKE em 8+ colunas pode demorar 100-600ms em datasets típicos. TTL cache 30s mitiga refetches.
- Cap defensivo 200 atributos no drill-down (caso patológico).

## [v0.18.0] 2026-05-01 — Integrações + Power BI (super_admin only)

> Novo menu **Integrações** com primeira integração **Power BI**.
> Provisioning automático de usuário/views Postgres + RLS opcional + 3 caminhos
> de conexão + audit completo. Workflow rigoroso (spec v3 + plan v3 com double-check).

### Implementação

- **Sidebar**: novo item "Integrações" (super_admin only) — entre Agente Nex e Usuários.
- **Hub `/integracoes`**: 5 cards (Power BI ativo + Looker Studio, Tableau, Excel/CSV, Webhooks "Em breve").
- **Sub-página `/integracoes/power-bi`**:
  - Lista de perfis em tabela (Status / Tabelas / Filtros / Criado em / Ações).
  - Wizard 4 passos pra criar/editar perfil: Identificação → Tabelas (5 facts + 5 dims) → Colunas (essential pré-marcadas, PK forçada) → Filtros (RLS opcional por account/team).
  - Modo edit com optimistic concurrency (`expectedUpdatedAt`).
  - Soft cap 50 perfis ativos.
- **Detail page `/integracoes/power-bi/[id]`**: Resumo + Whitelist + Credenciais + Auditoria. Banner amarelo de retry quando provisioning falha.
- **Connect page `/integracoes/power-bi/[id]/conectar`**: 3 abas — Power BI Desktop (passo a passo + senha mostrar/ocultar), Service/Gateway (recomendação + alternativa direta), Snippet M (accordion 1 bloco por view).
- **Reveal/rotate password**: rate-limited Redis (5/dia / 10/dia) + audit obrigatório.
- **Soft-delete** com confirm-by-typing exato do nome.

### Backend

- **Schema `powerbi`** isolada no banco interno: 4 tabelas snapshot (dim_accounts/inboxes/agents/teams) + 9 views passthrough + dim_dates calendar 2024-2030.
- **Provisioner DDL**: 4 funções (provision/disable/reactivate/deprovision). Idempotente via catch `42710` (CREATE→ALTER fallback). Tx 2 dropa views antigas via prefixo. Tx 3 cria views derivadas com RLS opcional. `pg_terminate_backend` antes de DROP USER. Pool admin dedicado com `statement_timeout=30s`.
- **SQL builders**: 13 builders via `pg-format` (escapa identifiers + literals). Zero string concat em SQL.
- **Worker BullMQ**: `integrations.refresh-dim-snapshots` (cron 30 min, UPSERT em transação) + `integrations.reconcile` (cron 6h, drift detection vs `pg_roles`/`pg_views`).
- **Catálogo declarativo** com `BLOCKED_TABLES_REGEX` (defesa em profundidade — provisioner valida ANTES de qualquer DDL).
- **Server Actions**: 12 actions (CRUD + reveal/rotate/disable/reactivate/delete + summary + freshness + triggerSync). Todas com `requireSuperAdmin` + `safeAction` + audit (per-profile + global).

### Schema

- 2 enums novos (`IntegrationKind`, `IntegrationProfileStatus`, `IntegrationAuditEvent`).
- 2 tables (`integration_profiles`, `integration_audit_logs`).
- 6 valores adicionados à enum `AuditAction`.
- Migration `20260501_add_integrations_power_bi` (manual deploy via `npx prisma migrate deploy`).

### Operacional

- Runbook completo em `docs/runbooks/integracoes-power-bi.md` (pré-requisitos infra, sequência de deploy, smoke staging 17 etapas, rollback, troubleshooting).
- Variáveis novas: `INTEGRATION_DB_HOST_PUBLIC`, `INTEGRATION_DB_PORT_PUBLIC`, `INTEGRATION_DB_NAME_PUBLIC`, `INTEGRATION_PROFILE_SOFT_CAP`.
- Reusa `ENCRYPTION_KEY` existente (AES-256-GCM).

### Segurança

10 camadas de defesa:
1. Schema isolada (`powerbi.*` único namespace exposto).
2. `BLOCKED_TABLES_REGEX` (users, audit_logs, llm_*, nex_*, app_settings, integration_*, etc).
3. Views derivadas por perfil (colunas filtradas).
4. GRANTs explícitos (USAGE + SELECT específicos).
5. CONNECTION LIMIT 5 por perfil.
6. TLS obrigatório (`hostssl` no `pg_hba.conf`).
7. IP allowlist (operacional, runbook).
8. Auditoria 100% (`audit_logs` global + `integration_audit_logs`).
9. AES-256-GCM em senhas at-rest.
10. Rate limit Redis (reveal 5/dia, rotate 10/dia).

### Tests

- ~140 novos testes (catalog 10, password 9, sql-builders 24, m-snippet 10, provisioner 10, dim-sync 6, reconcile 5, integrations actions 4, integrations-power-bi actions 31, hub-card 3, status-chip 3, wizard-step-identity 6, credentials-reveal 4, profile-list 4, summary-card, whitelist, credentials, audit, dialogs ~12, snippet-block 5, connect-desktop 4, connect-service 2, connect-snippet 3).
- typecheck 0 erros.

### Versão pulada

v0.17.0 foi tomada pelo agente paralelo Conversas Revamp; Power BI Integrations bumpa pra v0.18.0 (fallback declarado no protocolo multi-agente).



## [v0.17.0] 2026-05-01 — Conversas Revamp (export + busca + drill-down + virtualização)

> Revamp completo do `/relatorios/conversas`. Workflow rigoroso (spec v3 com 27+19 achados de pente-fino + plan v3 com 14 tasks granulares TDD + ui-ux-pro-max em todas as tasks de UI).

### Implementação

- **Botão Exportar** no toolbar — gera XLSX (até 50.000 linhas) respeitando filtros, ordenação e busca. Colunas dinâmicas por chave de `custom_attributes` (top-50 mais frequentes em ordem alfabética), header congelado, datas pt-BR, status/prioridade traduzidos.
- **Busca server-side** (Enter para aplicar): cláusula ILIKE OR sobre nome, WhatsApp, documento, estado (inbox), departamento (team), atendente, status (texto pt-BR), prioridade (texto pt-BR), etiquetas e atributos. Sanitize de `%`/`_`/`\` + cap 256 chars + `ESCAPE E'\\'` (std-conforming-strings safe).
- **Drill-down redesenhado**: 3 seções inline (WhatsApp / Etiquetas / Atributos) com rótulos alinhados via `min-w-[100px]`. Sem espaço fantasma entre seções (`space-y-2`). Sem botão "Abrir" duplicado.
- **Coluna #ID clicável** substitui coluna "Ações": border cinza fininho default, hover roxo (`border-violet-500/60` + `bg-violet-500/5` + `text-violet-500`), tooltip "Abrir conversa #N no Chatwoot", focus-visible ring violet, abre em nova aba via `<a target="_blank">`.
- **Coluna Etiquetas removida** da tabela e do `<ColumnsToggle>` (continua disponível no drill-down e o filtro `labelIds` em `<FiltersDialog>` permanece intacto).
- **Sem paginação visual**: removido seletor "100 / Todos", botão "Carregar mais" e `<InfiniteScrollSentinel>`. Backend traz tudo até `MAX_TABLE_ROWS=10.000`. Banner amarelo "Mostrando primeiras 10.000 — refine os filtros" quando `nextCursor` retorna não-null.
- **Virtualização** com `@tanstack/react-virtual` v3 — preserva thead sticky via padding-top/padding-bottom. Drill-down expand mensurado dinamicamente via `measureElement`.
- **LoadingOverlay polish**: label dinâmico (`Carregando conversas...` / `Buscando...` / `Gerando planilha...`), `bg-card/70 backdrop-blur-md` (mais blur), fade-in `motion-safe:animate-in`, spinner com `animation-duration:1.2s` motion-safe.
- **Tour `conversas-v2`**: novo step "Exportar"; descrições de search/drill-down/open-action reescritas; step `page-size` removido; `id` bumpado para forçar re-onboarding.

### Compat

- `localStorage["conversas-table-page-size"]` é limpo automaticamente no mount (cleanup runtime).
- `chatwootConversationUrl(accountId, displayId)` mantém assinatura — usa as URLs públicas per-account configuradas em `/configuracoes` (entregue na v0.16.0) quando há mapping; senão fallback para env var.

### Notas

- Cap de export: 50.000 linhas (toast warning quando excede).
- Cap de tabela: 10.000 linhas (banner amarelo quando excede).
- Cap de 50 colunas dinâmicas no XLSX (top-N por frequência); excedente reportado em `droppedAttrCount` no result da Server Action.
- `OpenInChatwoot` mantido (ainda usado em dashboard, mensagens-nao-respondidas e outros relatórios).



## [v0.16.0] 2026-05-01 — Suite Agente Nex · Refinement

> Pacote consolidado de polish da Suite Agente Nex (lançada em v0.15.x). Spec v3 com 51 achados de pente-fino + plan v3 com 50 tasks granulares (TDD, ui-ux-pro-max em UI). 982 testes verde.

### A. Tela "Chaves de API"

- Header de provedor padronizado (ícone + label + atalho "Criar API key" + botão "Nova chave" gradient).
- AlertDialog substituiu `window.confirm` na exclusão.
- Card vazio com 2 CTAs amigáveis.

### B. Tela "Configuração do Agente Nex"

- Mais respiro (`space-y-8` + sections com border-t).
- Modelo customizado **inline** (SearchableSelect com `customMode` — input editable no próprio trigger).
- 4 tiers de classificação (azul `low` / amarelo `medium` / laranja `high` / vermelho `premium`) — adiciona tier `premium` para modelos > $30/M output (gpt-5.5-pro, o1-pro, o3-pro, etc).
- Catálogo OpenRouter expandido para **118 modelos** (DeepSeek V3/V4/R1/R1-0528/Coder, Qwen 2.5/3/3.5/3.6, Llama 3.1/3.3/4, Mistral Codestral/Pixtral, Cohere R/R+/R7B/A, xAI Grok 2/3/4/4.20/4.3, Microsoft Phi-3.5/Phi-4, Nous Hermes 3, Liquid LFM, Reka, Perplexity Sonar família, Inflection, etc).

### C. Tela "Prompt do Agente Nex"

- **PromptPreviewCard** novo no topo: preview client-side de `composeSystemPrompt` (puro/isomórfico) atualizando em tempo real, com Copiar/Maximizar e identidade fixa colapsável.
- "Modo override avançado" → **"Modo prompt manual"** com tooltip explicativo + AlertDialog de ativação (warning) + bloqueio de Salvar quando texto vazio + disabled state com texto auxiliar laranja em Personality/Tone/Guardrails.
- **PlaygroundSheet** lateral substitui Playground inline: `<Sheet side="right" w=480px>` acionado pelo botão "Abrir playground" no header da página, max 20 mensagens FIFO efêmero (não persiste).
- IDENTITY_BASE atualizada: blindada contra "ChatGPT/GPT/Claude/Gemini/OpenAI/Anthropic/Google" como identidade. Menciona exclusivamente "Nexus Insights" e "Nexus Chat". Define formato de deep-links via mapeamento de URLs públicas configuradas em /configuracoes.
- Guardrails default seedados via flag `seeded_defaults_at` (idempotente — não ressuscita se super_admin apaga depois).
- KB aceita **URL** além de PDF/TXT: SSRF guard (`assertPublicUrl` bloqueia ranges privados RFC1918 + loopback + link-local + cloud metadata) + fetcher (10s timeout, 5MB cap, html-to-text via node-html-parser) + erros enumerados (URL inválida, timeout, 4xx/5xx, mime, body grande, etc).
- Atalho "Adicionar API Chatwoot (sugerida)" pré-preenche aba URL.

### D. Tela "Consumo do Agente Nex"

- PeriodPills compartilhada com /relatorios/conversas (mesmo componente).
- KPIs uniformes 4 casas decimais (round half-up via `formatBrl4`/`formatUsd4`) + `min-h-[128px]` em todos os 4 cards.
- Ícone "Total de chamadas": `PhoneCall` → `Activity`.
- Gráficos custo por dia / custo por modelo: eixo Y com `R$` + 2 casas + fonte 13px (era 12) + xAxisPadding 12 (era 8) + datas formatadas `30/ABR` (uppercase month-short pt-BR).
- Donut "Distribuição por provider": tooltip em `position={top-right}` (não cobre mais o donut nem o valor central) + content em 2 linhas (nome + valor + %) com max-w-[180px] + centro do donut com 4 casas.
- Tabela "Chamadas detalhadas" → **"Histórico de chamadas"** (com ícone History).
- Filtros server-side cascateados (Provider → Modelo) via `<UsageTableFilters>`.
- Linha de total no topo (sticky) com totals server-side via `getUsageDetails` retornando `{ rows, total, totals }`.
- Drill-down por linha em `<UsageDetailSheet>`: 5 seções (Identificação, Tokens, Duração, Custo, Erro) com cotação USD/BRL aplicada (com spread embutido) + spread atual informativo + cotação base estimada + Whisper "—" em tokens (com nota explicativa) + Copiar JSON.
- Colunas renomeadas: "Tokens in" → "Tokens de entrada", "Tokens out" → "Tokens de saída".
- Paginação 3-zonas no footer: "Mostrando X-Y de N" / "Página X de Y + setas" / "{n} por página" dropdown (25/50/100).
- USD/BRL bruto na tabela (sem round adicional).

### E. Calendar global

- `weekStartsOn=1` (segunda-feira) e `showOutsideDays=false` por default em todos os usages. Dias de outros meses não aparecem mais no grid (resolve bug visual reportado: maio 1-2 não aparece em abril).

### F. URLs Públicas Chatwoot

- Card novo em `/configuracoes` "URLs Públicas Chatwoot" (super_admin only): lista accounts via `listKnownAccountIds()` (DISTINCT account_id de chatwoot_facts_daily_by_account) + input editável de URL + botão Salvar explícito por linha (UPSERT; URL vazia → DELETE; audit logado).
- Schema novo `model ChatwootAccountUrl` (account_id PK, public_url, label?, updatedAt, updatedById).
- Agente Nex injeta seção "## URLs públicas das contas" no system prompt (apenas com override desligado e ≥ 1 account configurada).

### G. Schema, Audit, Deploy

- Migration aditiva `20260501_v0_16_kb_url_chatwoot_urls_audit`:
  - `nex_kb_documents`: + `kind TEXT DEFAULT 'PDF'` + `source_url TEXT NULL`.
  - `nex_settings`: + `seeded_defaults_at TIMESTAMPTZ NULL`.
  - `chatwoot_account_urls`: tabela nova.
  - Backfill condicional de 5 guardrails default (somente se nunca tocado).
- Novo enum `NexKbKind { PDF | TXT | URL }`.
- Audit log universal: toda mutação de prompt config, KB doc, ChatwootAccountUrl loga `setting_updated` com `previous`/`next`.
- Workflow: spec v1→v2→v3 (51 achados de pente-fino) + plan v1→v2→v3 (50 tasks TDD) → subagent-driven-development com `ui-ux-pro-max:ui-ux-pro-max` em UI → 982 testes verde / typecheck 0 erros / build verde.

### Notas técnicas

- `composeSystemPrompt` agora isomórfico (núcleo puro extraído para `prompt-compose.ts` sem `server-only`); permite preview client-side em `<PromptPreviewCard>`.
- `addKbUrlAction` + `refreshKbUrlAction` (Server Actions) usam `assertPublicUrl` + `fetchKbUrl` em `src/lib/nex/kb-url.ts`. Refresh em URL falha mantém `extractedText` antigo (UPDATE só roda em sucesso).
- `getUsageDetails` retorna `{ rows, total, totals }` com filtros provider/model aplicados via SQL `($n::text IS NULL OR coluna = $n)`.
- `<SearchableSelect>` ganhou prop `customMode` (input editable no trigger quando sentinel selecionado).
- Calendar global mantém override via prop (back-compat).

---

## [v0.15.4] 2026-05-01 — UX bubble audio refinements

> Super_admin reportou (com screenshots): (1) speed button do AudioPlayer com container preto vazando do balão violeta, (2) input bar com layout mudando entre idle e gravando, (3) áudio só aparece DEPOIS da transcrição, (4) áudios somem ao recarregar a página.

### Fix

- **AudioPlayer speed button**: removido ícone Gauge + container preto/borda dura. Agora é texto puro (`1×`/`1.25×`/`1.5×`/`1.75×`/`2×`) com border violet sutil (`border-violet-500/30`) + hover animado (`scale-105` + `bg-violet-500/20` em 150ms) — coerente com o balão violeta do player. Cícla na mesma sequência (`Velocidade Nx (clique para próxima)`).
- **Input bar layout estável**: container `flex items-end gap-2` IDÊNTICO entre idle e gravando. "Inner area" (`flex-1 rounded-xl border border-input bg-background min-h-9`) sempre no mesmo lugar — só o conteúdo interno alterna entre `<textarea>` (idle) e `<AudioRecorder mode="embedded">` (recording/paused). Mic externo (à esquerda) só aparece em idle. Send externo (gradient violet) SEMPRE no mesmo lugar/tamanho/estilo, com comportamento dinâmico: idle → `handleSend(input)`; recording → `recorderRef.current?.sendNow()`.
- **Áudio aparece imediatamente ao enviar**: player visível ANTES da transcrição (com loading "Nex pensando" abaixo). Quando Whisper responde, transcrição é injetada na própria msg de áudio (`content: text`); resposta da IA SUBSTITUI a loadingMsg pelo `id` (preserva ordem). Em caso de erro de transcrição, remove loading mas mantém o player do áudio (UX: usuário vê que gravou).
- **Áudios persistem entre sessões via IndexedDB**: nova lib `src/lib/nex/audio-storage.ts` com `saveAudio/getAudio/deleteAudio/clearAllAudios` (IDBDatabase wrappers, no-op em SSR). `localStorage` continua persistindo metadados das mensagens; o blob binário fica em IDB. No mount, `useEffect` re-hidrata `audioBlobUrl` para mensagens com `hasStoredAudio=true` e blob no IDB. "Limpar conversa" agora chama `clearAllAudios()` também. Skeleton "carregando áudio…" aparece enquanto IDB hidrata; fallback "(áudio expirado)" só em casos legados (pré-v0.15.4).

### Implementação

- `AudioRecorder` ganha prop `mode?: "standalone" | "embedded"` + `forwardRef` + `useImperativeHandle` expondo `start/pauseOrResume/cancel/sendNow`. No modo "embedded": idle retorna `null` (pai mostra textarea); recording/paused renderiza só pulse + texto + timer + pause/cancel — sem container próprio nem Send (Send é externo, no panel).
- `NexChatPanel` mantém UMA instância de `<AudioRecorder ref mode="embedded">` dentro da inner area; alterna `<textarea>` ↔ recorder via `isRecording` (controlado pelo `onRecordingStateChange` callback). `handleSendClick` decide texto vs `recorder.sendNow()` baseado em `isRecording`.
- `NexMessage` ganha prop `hasStoredAudio?: boolean` para distinguir 3 estados visuais: player (com blob), skeleton (carregando IDB), fallback (legacy).
- 5 novos tests: `audio-recorder` modo embedded (idle null + recording sem Send + ref imperativa), `nex-message` skeleton + content vazio, `audio-storage` no-op SSR (4 funções).

### Compat

- localStorage key `nex-history-v1` mantida; mensagens v0.15.3 sem `hasStoredAudio` viram fallback "(áudio expirado)" (esperado — não há blob salvo no IDB para mensagens antigas).
- API do `AudioRecorder` em modo "standalone" inalterada — caller existente (qualquer outro consumidor futuro) continua funcionando sem mudança.

---

## [v0.15.3] 2026-05-01 — Hotfix gravação não aparece (regressão da v0.15.2)

> Super_admin reportou: clica no mic, browser mostra ícone de gravação ativa no tab, mas a UI volta ao botão Mic — barra de gravação nunca aparece.

### Causa

A v0.15.2 introduziu **DUAS instâncias** do `<AudioRecorder>` no JSX do `NexChatPanel`: uma em `isRecording=true` (modo full-width), outra em `isRecording=false` (idle ao lado do textarea). Quando o `start()` async setava `status="recording"` internamente no recorder, o callback `onRecordingStateChange(true)` mudava `isRecording` no parent, e o React **desmontava** a instância idle e **montava** outra do zero — perdendo o `status` interno e os refs do `MediaRecorder`. O stream do mic continuava ativo no browser (daí o ícone do tab), mas a UI mostrava um componente novo em estado `idle`.

### Fix

UMA única instância do `<AudioRecorder>` sempre montada quando `audioInputEnabled && !audioFlight`. Apenas os siblings (textarea + Send button + label "Enter envia") são renderizados condicionalmente baseados em `isRecording`. Quando gravando, o recorder ganha `flex-1` para ocupar todo o espaço disponível.

### Notas

- Layout final = intenção do v0.15.2 (textarea/send somem; barra ocupa tudo) — só corrigido o lifecycle.
- `className` já era prop suportada pelo `AudioRecorder`; nenhuma mudança nele.

---

## [v0.15.2] 2026-05-01 — Hotfix UX bubble audio (3 bugs)

> Super_admin reportou: (1) input bar quebrado quando gravando (textarea esmagado + 2 botões enviar), (2) timer continua avançando quando pausado, (3) speed dropdown ruim de usar.

### Fix

- **Input bar reorganizado:** quando gravando/pausado, textarea + label "Enter envia" + botão enviar texto somem; AudioRecorder ocupa todo o espaço com Send único. Implementado via prop `onRecordingStateChange?: (active: boolean) => void` no `AudioRecorder` + state `isRecording` no `NexChatPanel`.
- **Timer respeita pause:** novos refs `recordedMsRef` (tempo acumulado em segmentos anteriores) + `segmentStartedAtRef` (início do segmento atual) — pausar para de contar (clearInterval + soma elapsed em recordedMsRef), retomar continua de onde parou (reseta segmentStartedAtRef + restart do tick). Fórmula: `total = recordedMsRef + (now - segmentStartedAtRef)`. `sendNow` lê `rec.state` para saber se soma o segmento corrente.
- **AudioPlayer speed cíclico:** `<select>` virou `<button>` com ícone `Gauge` (lucide) — click cicla 1× → 1.25× → 1.5× → 1.75× → 2× → 1×. aria-label dinâmico "Velocidade Nx (clique para próxima)" + tooltip via title.

### Tests

- `audio-recorder.test.tsx`: + teste `onRecordingStateChange` (idle→true→true em pause→false em cancel) + teste timer congela em pause e retoma corretamente (jest fake timers).
- `audio-player.test.tsx`: trocados testes do `<select>` por testes do botão cíclico (1× inicial → 1.25× → ... → 2× → 1×).
- `nex-message.test.tsx`: ajustado aria-label para o novo formato.
- 762/762 testes verdes, typecheck 0 erros.

## [v0.15.1] 2026-05-01 — Hotfix microfone bloqueado por Permissions-Policy

> Super_admin reportou: ao clicar no mic da bolha aparece "Acesso ao microfone negado" mesmo permitindo no browser.

### Causa

`next.config.ts` definia o header `Permissions-Policy: camera=(), microphone=(), geolocation=()` em **todas as rotas**. A diretiva `microphone=()` (lista de origens vazia) instrui o navegador a bloquear `getUserMedia` para microfone **independentemente da permissão do usuário**. Quando o `AudioRecorder` chamava `navigator.mediaDevices.getUserMedia({ audio: true })`, o browser disparava `NotAllowedError` antes mesmo de mostrar o prompt — daí o toast genérico "Acesso ao microfone negado".

### Fix

`Permissions-Policy: camera=(), microphone=(self), geolocation=()` — `(self)` libera o `getUserMedia` para microfone na própria origem (`insights.nexusai360.com`). Camera e geolocation seguem bloqueados.

### Notas

- Não toca no fluxo do AudioRecorder; apenas remove o bloqueio do navegador.
- Após deploy: hard refresh (Cmd/Ctrl+Shift+R) garante que o header novo seja recebido.

---

## [v0.15.0] 2026-05-01 — Suite Agente Nex (sidebar dedicado + áudio + prompt config)

### Adicionado

- **Menu lateral "Agente Nex"** com 4 sub-páginas (`/agente-nex/configuracao`, `/agente-nex/chaves`, `/agente-nex/prompt`, `/agente-nex/consumo`). Item antigo "Consumo IA" standalone removido.
- **Gravação de áudio na bolha** (record/pause/cancel/send) com cap de 5 min — Whisper API transcreve, IA responde texto. AbortController cancela uploads em flight.
- **Player de áudio** customizado no balão do user com 5 níveis de velocidade (1×/1.25×/1.5×/1.75×/2×) + seek.
- **Copy button universal** em mensagens do user E assistant (antes só nas da IA).
- **System prompt configurável** — personalidade + tom + guardrails (até 20 × 300 chars) + override avançado (até 50k chars), persistidos em `nex_settings` (singleton).
- **Base de conhecimento (KB)** — upload de PDFs/TXT (≤ 5 MB), extração via `pdf-parse`, sanitize NUL bytes, cap 30k chars no prompt total, lista visual com warnings de cap.
- **Playground inline** — testa prompt sem persistir; resposta no mesmo card; link "ver prompt usado".
- **Toggles** (audio + KB) no card "Recursos" com gating dinâmico de provider (mic só com OpenAI ativo).

### Mudado

- Tela "Consumo IA" migrou para `/agente-nex/consumo`. URL antiga `/configuracoes/consumo` mantém-se com **redirect 308**.
- `/configuracoes` perde os cards Nex (movidos para `/agente-nex`).
- `runNexAgent` lê system prompt **dinâmico** de `nex_settings` (não mais constante hardcoded). Suporta `promptOverride` + `isPlayground` (skip de logUsage).

### Schema (runtime via `ensureNexTables`)

- Nova tabela `nex_settings` (singleton id="global") com personalidade, tom, guardrails JSONB, advanced_override, audio_input_enabled, kb_enabled.
- Nova tabela `nex_kb_documents` (id, name, mime_type, file_size, char_count, extracted_text, ...) + index `created_at DESC`.
- `MODEL_PRICING` ganha `whisper-1` (per-minute, $0.006/min). Função `calculateCost` ganha 4º arg opcional `extras: { durationMs }`.
- Enum `AuditAction` ganha mais um targetType: `nex_prompt`, `nex_kb_document` (textuais — não afetam enum DB).

### Notas

- Whisper requer chave OpenAI ativa. Toggle audio com provider != openai persiste mas é desativado em runtime via `effectiveAudioEnabled = audio_input_enabled && provider==="openai"`.
- Áudio: `URL.createObjectURL` no client; após reload `audioBlobUrl` se perde — UI mostra fallback "(áudio expirado)" + transcrição preservada no localStorage.
- KB: cap por doc 100k chars; cap total 30k chars no prompt (último doc truncado com `[...truncado...]`).
- Workflow: spec v1→v2→v3 (22+26 achados de pente fino), plan v1→v2→v3 (25+29 achados). Subagent-driven-development com 28 tasks granulares. UI/UX Pro Max em todas as tasks UI.
- 89 suites / 760 tests PASS · typecheck 0 erros.

---

## [v0.14.3] 2026-05-01 — Hotfix dashboard: noResponse filtra activity msgs + ordem chart-noresponse + nav compacto + cache bump

### Fix

- **`noResponse` (card "Conversas sem resposta") mostrava "Tudo respondido" mesmo com conversa real do contato sem resposta**: a CTE `last_msg` pegava a "última mensagem" sem filtrar tipo. Como o Chatwoot grava mensagens de **activity** (atribuição, reabertura, etc.) e **template** na mesma tabela `messages` com `message_type` 2 e 3, a "última msg" frequentemente era um evento de sistema, fazendo o filtro `lm.message_type=0` (incoming) falhar. Agora a CTE filtra `WHERE m.message_type IN (0, 1)` (apenas incoming/outgoing reais), e a "última" passa a ser de fato a do contato ou do agente.
- **Cache key bump v7→v8** — descarta possíveis stale do v0.14.2 enquanto investigamos o bug de Semana/Mês mostrar 0 em 01/05 (provavelmente cache, mas defensivo).

### Mudou

- **Ordem dos componentes**: chart "Conversas por hora/dia" sobe para **acima** de "Conversas sem resposta" + "Atendentes mais rápidos" (era abaixo). Pedido do João.
- **`<PeriodNavigator>` ainda mais compacto**: ícones h-5 w-5 (era h-6 w-6), texto `text-[11px]` (era text-xs/sm), padding interno menor. Borda violeta `border-violet-500/50` com shadow violeta sutil. Hover intensifica para `border-violet-500` + shadow maior. Texto branco-violeta puro para destaque.

### Verificação

- 674 testes / 77 suites PASS · typecheck 0 erros · build verde local.

---

## [v0.14.2] 2026-05-01 — Coorte por atividade (open/pending) + chart Dia full-width + nav compacto

> Bug crítico reportado pelo João: conversa criada em 30/04 e **reaberta** em 01/05 às 5h15 não aparecia em "Abertas (no período)" nem no gráfico do dia 01/05 — tudo zerado. Causa: SQL filtrava por `created_at ∈ período` (decisão da v0.10 "mesma coorte"), perdendo conversas reabertas. Corrigido para usar `last_activity_at` nas séries que falam de **atividade** (open/pending/no-response).

### Mudou

- **`dashboard-data.ts` chart query**: `received`/`resolved` continuam por `created_at` (coerência com KPIs); `open`/`pending` passam a usar `last_activity_at` no bucket. Implementado via `FULL OUTER JOIN` de duas CTEs (`created_buckets` + `activity_buckets`).
- **KPI "Abertas (no período)"**: filtra `status=0 AND last_activity_at ∈ período` (era `created_at`).
- **`byTeam`/`topInboxes`**: filtram por `last_activity_at` (open=0, pending=2, snoozed=3 com atividade no período).
- **`byStatus`**: status 0/2/3 por `last_activity_at`; status 1 (resolved) mantém `created_at`.
- **`noResponse`** (card hero + drill-down): filtra `last_activity_at ∈ período + status=0 + última msg é do contato`. Captura conversas reabertas com mensagem aguardando resposta.
- **Cache key bump**: `dashboard-data-v6` → `v7`.
- **Chart "Dia" full-width**: removido scroll horizontal de 24 buckets. Agora todos os modos (Dia/Semana/Mês) usam `<ResponsiveContainer width="100%" height={350}>`. Eixo X com `interval="preserveStartEnd"` + `minTickGap={20}` para auto-deduplicar labels apertados.
- **`<PeriodNavigator>` compacto**: padding menor (h-6 w-6 ícones), borda violeta sutil (`border-violet-500/40`), hover violeta (`hover:border-violet-500/70 hover:bg-violet-500/5`), focus ring violeta. Largura auto-ajustável conforme label.

### Verificação

- 674 testes / 77 suites PASS · typecheck 0 erros · build verde local.

---

## [v0.14.1] 2026-05-01 — Hotfix Agente Nex × Matrix IA: cast PG + role explícito

> Dois bugs descobertos pelo super_admin testando o Nex em todas as configurações de visibility do Matrix IA:
>
> 1. **`could not determine data type of parameter $2`** quando visibility = "Todos". A tautologia que eu introduzi no v0.13.9 (`($2 IS NOT NULL)`) não passa no planner do Postgres sem cast — o param só aparecia em `IS NOT NULL`, sem comparação que dê pista de tipo, e o pg falhava no prepare statement.
> 2. **Visibility `super_admin_only` excluía Matrix IA mesmo logado como super_admin.** `auth()` chamada **dentro** de outra Server Action (Nex action → `runNexAgent` → `shouldExcludeMatrixIA`) podia retornar `null` no Next.js 16, levando a função a tratar como "sem role" e excluir por segurança.

### Fix 1: cast `::integer` na tautologia

`src/lib/llm/tools/executor.ts → matrixIAClause()`:
```ts
return excludeMatrixIA
  ? `c.inbox_id <> $${paramIdx}::integer`
  : `($${paramIdx}::integer IS NOT NULL)`;
```
Cast explícito força o tipo do parâmetro durante o `prepare`, antes do planner tentar inferir do contexto. Resolve o erro tanto no caminho exclude quanto no não-exclude.

### Fix 2: role explícito em vez de `auth()` reentrante

- Nova função `shouldExcludeMatrixIAForRole(role)` em `src/lib/reports/exclude-matrix-ia.ts` que aceita o role como parâmetro (não consulta `auth()`).
- `runNexAgent` ganha campo opcional `platformRole` em `RunNexInput`.
- `sendNexMessage` (action) extrai `platformRole` da session que **já resolveu** e passa direto pro `runNexAgent`. Mesma fonte de verdade, sem reentrância.
- `shouldExcludeMatrixIA()` (assinatura sem argumentos) continua existindo como wrapper para chamadores que não têm role à mão (queries de relatórios).

### Resultado esperado

- visibility = `Todos` → Nex inclui Matrix IA, conta funciona sem erro de PG.
- visibility = `super_admin_only` + super_admin logado → Nex inclui Matrix IA.
- visibility = `super_admin_only` + viewer/manager → Nex exclui Matrix IA.
- visibility = `Ninguém` → Nex exclui para todos.

### Outras notas

- 77 suites / 674 tests PASS · typecheck 0 erros.

---

## [v0.14.0] 2026-05-01 — Dashboard chart polish: navegação por período + eixo cheio + sem dots/legenda

### Mudou

- **Pill "Hoje" → "Dia"** no `DashboardFilters` (tipo `DashboardPeriod = "dia" | "semana" | "mes"`).
- **Backend `getDashboardPeriod` aceita `referenceDate?: Date`** — permite navegar entre períodos. `dashboardData` aceita `forcedGranularity` para garantir que "Mês" use granularity=day mesmo quando window é só 1 dia (mês atual com referenceDate=hoje).
- **Range cobre período inteiro**: "Semana" vai segunda → domingo (ou dia configurado), "Mês" vai dia 1 → último dia do mês — mesmo dias futuros entram (vazios, como o user pediu). Era `endOfDay(now)`, agora `endOfWeek/endOfMonth(refInTz, ...)`.
- **`actions/dashboard.ts`** retorna `nextAvailable` (false quando range.end >= now) para o frontend habilitar/desabilitar setinha forward.
- **Cache key bump**: `dashboard-data-v5` → `v6` (por adição de `forcedGranularity`).

### Adicionado

- **`<PeriodNavigator>`** novo componente (`src/components/dashboard/period-navigator.tsx`):
  - Setinha ← / texto / setinha → no canto superior direito do chart.
  - Label adaptativo: "01/05" para Dia, "27/04 — 03/05" para Semana, "MAI/26" para Mês (3 letras + ano abreviado).
  - Navegação livre para o passado (sem trava — vai até primeiro dia de dados de fato; backend retorna 0/0 se data sem dado). Setinha forward desabilitada quando range.end já cobre `agora`.
- **State `referenceDate`** no `dashboard-content.tsx`. Reset para `null` quando period muda.

### Polish

- **Chart sem `<Legend>`** recharts (a legenda ficava redundante com os checkboxes).
- **Chart sem `dot={true}`** nos pontos (`dot={false}` mantido).
- **Chart full-width** quando `granularity="day"` (Semana/Mês) — `<ResponsiveContainer width="100%" height={350}>` direto sem wrapper de width fixo.
- **Chart com scroll horizontal** apenas quando `granularity="hour"` (Dia) — 24 buckets centralizando na hora atual ou no meio do dia para datas passadas.
- **Eixo X completo** via `fillBuckets(data, granularity, tz, range)` — preenche TODOS os dias/horas do range com 0/0 quando não há dado.

### Fix

- **`formatWaiting` em "Conversas sem resposta"** centralizado em `formatDuration` (`@/lib/utils/format-time`) — agora usa "1 dia"/"3 dias" depois de >= 24h em vez de "82h 40min". Aplicado no `NoResponseCard` e no `NoResponseDrillDownContent`.

### Verificação

- 674 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.9] 2026-05-01 — Agente Nex respeita visibility do Matrix IA

> O Agente Nex hardcodava `inbox_id <> 31` em **todas** as queries de tools — independentemente da configuração de visibility. Agora ele respeita a regra 3-níveis igual ao resto do app: `all` (vê), `super_admin_only` (super_admin vê, demais não) e `none` (ninguém vê).

### Causa

`src/lib/llm/tools/executor.ts` (executor das tools do Nex) tinha 7 funções com `c.inbox_id <> $2` cravado direto no SQL. Foi escrito assim no v0.7 quando o Matrix IA era sempre excluído por design. Quando v0.11.0 introduziu a regra 3-níveis (e v0.12.1 corrigiu o bug do "Ninguém"), o Nex ficou desalinhado — continuou ignorando a inbox 31 mesmo quando a config dizia "Todos".

### Fix

- **`executor.ts`** ganhou helper `matrixIAClause(excludeMatrixIA, paramIdx)` que devolve `c.inbox_id <> $N` quando deve excluir, ou `($N IS NOT NULL)` (tautologia, sempre `TRUE`) quando não. A tautologia preserva o índice de parâmetros — zero refactor nos `++p`/`$3`/`$4`/etc subsequentes.
- **`executeTool(name, args, accountId, excludeMatrixIA)`** propaga o flag para todas as 7 funções afetadas (`queryConversations`, `queryMessages`, `aggregateConversations`, `getTopAgents`, `getDashboardSummary`, mais 2 no path agg secundário).
- **`runNexAgent`** chama `shouldExcludeMatrixIA()` UMA vez no início da conversa e passa para cada `executeTool`. Mesma fonte da verdade que `/dashboard`, `/relatorios/conversas`, etc.

### Resultado

- Visibility = `all` (Todos): Nex vê e responde sobre conversas da inbox 31 (Matrix IA).
- Visibility = `super_admin_only`: super_admin vê, viewer/manager não.
- Visibility = `none`: Nex não vê para ninguém (inclusive super_admin).

### Outras notas

- 77 suites / 672 tests PASS · typecheck 0 erros.
- Mock de `shouldExcludeMatrixIA` adicionado em `run-nex.test.ts` (NextAuth não roda em ambiente Jest).

---

## [v0.13.8] 2026-05-01 — Hotfix RSC error: simplifica dashboard-settings

> O v0.13.7 trazia o pipeline `getDashboardPeriod + getDashboardSettings` de volta, mas o dashboard mostrou "An error occurred in the Server Components render. The specific message is omitted in production builds...". A combinação `import "server-only"` + `let cache` module-level + import via Server Action files (`actions/dashboard.ts` e `actions/dashboard-drill-down.ts`) parece causar bundling/RSC issue no Next.js 16.

### Mudou

- **`src/lib/dashboard-settings.ts` simplificado**:
  - Removido `import "server-only"` (a função continua server-only de fato — `pgPool` é server-only).
  - Removido `let cache` module-level. Lê DB toda vez (chamada raríssima — settings change manual via super_admin).
  - `invalidateDashboardSettings()` virou no-op (mantido por compat).
  - SQL muda de `WHERE key = ANY($1::text[])` para `WHERE key IN ('...', '...', '...')` (sem parâmetros, mais resiliente).
  - `WeekStartsOn` e `DashboardMode` re-exportados daqui (centralização).
  - `DASHBOARD_DEFAULTS` exportado para uso pelos Server Actions.

- **`src/lib/actions/dashboard.ts` e `dashboard-drill-down.ts` simplificados**:
  - Imports cleaner — só o que é usado em runtime.
  - Try/catch defensivo individual em volta de cada `await getPlatformTz()` e `await getDashboardSettings()`.
  - Uso direto de `DASHBOARD_DEFAULTS` em vez de declarar `FALLBACK_SETTINGS` local.

### Verificação

- `npm test` 668 testes / 76 suites PASS (1 suite alheia falha pré-existente sem relação) · typecheck 0 erros · build verde.

---

## [v0.13.7] 2026-05-01 — Dashboard chart redesenhado: 4 séries multi-cor + checkboxes + eixo cheio respeitando configs

> Resolve 4 problemas reportados pelo João após o v0.13.3:
> 1. Tempo de resposta mostrava "1d", "3d" — usuário queria "1 dia", "3 dias".
> 2. Filtro "Semana" mostrava rolling 7d (esquerda do hoje) em vez de **semana atual** configurada (segunda → domingo).
> 3. Filtro "Mês" idem — mostrava rolling 30d em vez de **mês atual** (dia 1 → fim).
> 4. Gráfico tinha apenas 2 séries (Recebidas, Resolvidas), fontes pequenas e sem opção de selecionar séries.

### Mudou

- **`formatDuration` em `src/lib/utils/format-time.ts`** passa a usar `"1 dia"` / `"3 dias"` em vez de `"1d"` / `"3d"`. Mantém formatos de horas/minutos/segundos.
- **`actions/dashboard.ts` e `actions/dashboard-drill-down.ts` voltam a usar `getDashboardPeriod` + `getDashboardSettings`** (rolledback indevidamente no v0.13.3). Agora com **try/catch defensivo** em volta de cada read de settings — se algo falha, usa `FALLBACK_SETTINGS` (segunda + atual + atual) e o dashboard continua abrindo.
- **`getDashboardData` retorna `settings`, `tz` e `range`** no payload — frontend usa para preencher o eixo X corretamente.

### Adicionado

- **`ConversationsLineChart` redesenhado**:
  - **4 séries** com cores conforme feedback: Recebidas → verde (`#22c55e`), Abertas → amarelo (`#f59e0b`), Resolvidas → azul (`#3b82f6`), Pendentes → roxo (`#8b5cf6`).
  - **Checkboxes** para mostrar/ocultar séries (preferência persistida em `localStorage`).
  - **Eixo X cobre todo o período configurado**: 24 horas em "Hoje" (com rolagem horizontal centrando na hora atual), todos os dias da semana atual em "Semana", todos os dias do mês em "Mês". Buckets vazios renderizam como 0 — antes só apareciam dias com dados.
  - **Fontes maiores**: eixo X 13px (era 11px), eixo Y 13px (era 11px), `tickMargin=14` (era 12).
  - Tooltip enriquecido com bullet colorido + tabular-nums.
  - Cache key bumped → `dashboard-data-v5` (chart agora retorna 4 séries).

### Cuidado tomado para evitar repetir o crash do v0.13.0

- Componente usa `<ResponsiveContainer width="100%" height="100%">` dentro de `<div style={{ width: <number>, height: 350 }}>` — pai com **dimensões fixas explícitas**, não dinâmicas.
- `useEffect` para centrar scroll com guards (`!scrollRef.current` retorna early).
- Sem `expandFullDay` recursivo nem cálculo de offset com TZ do navegador.

### Verificação

- `npm test` 671 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.6] 2026-05-01 — Mensagens dos providers em PT-BR + probe com orçamento de tokens compatível com reasoning

> Dois ajustes em cima do v0.13.5: (1) probe de Testar conexão batia em "max_tokens or model output limit was reached" em modelos reasoning (gastam tokens internos no thinking) — `max_completion_tokens` subiu de 1 para 256. Aproveitamos para tratar essa mensagem específica como **conexão OK**. (2) Toda mensagem em inglês vinda dos providers (OpenAI/Anthropic/Gemini/OpenRouter) agora passa por um tradutor que cobre os padrões mais comuns.

### Probe ajustado

- `deepTestOpenAI` reasoning: `max_completion_tokens: 256` (era 1) — cobre thinking + resposta curta com folga. Custo do teste em `gpt-5.4-mini`: ~$0,000512.
- `deepTestOpenAI` non-reasoning: `max_tokens: 16` (era 1) — margem maior para qualquer modelo conservador.
- `400 "max_tokens or model output limit was reached"` agora é tratado como `reachable: true` (a chave e o modelo funcionam, só faltou orçamento no probe).

### Tradutor de mensagens (PT-BR)

Novo helper `translateProviderMessage(raw, model)` que mapeia padrões em inglês para PT-BR. Cobre:

- `"only supported in v1/responses"` → "Este modelo (X) só funciona via API 'Responses' da OpenAI. O Agente Nex ainda não suporta — escolha outro modelo (gpt-5-mini, gpt-5.4-mini, gpt-4.1-mini ou similar)."
- `"does not exist or you do not have access"` → "Modelo X indisponível nesta chave (acesso restrito ou ID inválido)."
- `"do not have access"` → "Sua chave não tem acesso a este modelo. Verifique o tier da sua conta na OpenAI."
- `"max_tokens or model output limit was reached"` → "O modelo não conseguiu completar a resposta no orçamento de tokens do teste — mas a chave e o modelo funcionam." (note: hoje já viramos `reachable: true` antes de chegar aqui).
- `"context length exceeded"`, `"insufficient_quota"`, `"rate_limit"`, `"invalid api key"` — todos com mensagens equivalentes em PT-BR.
- Sem padrão conhecido → retorna a mensagem original (melhor inglês que perder informação).

Aplicado em **todos os caminhos de erro** de `deepTestOpenAI`, `deepTestAnthropic`, `deepTestGemini` e `deepTestOpenRouter`. O prefixo "OpenAI:" / "Anthropic:" / etc. saiu — agora a mensagem fica direta.

### Outras notas

- 77 suites / 671 tests PASS · typecheck 0 erros.
- API "Responses" da OpenAI (necessária para `gpt-5.1`, `gpt-5.5` em alguns casos) fica como follow-up futuro — por ora a mensagem orienta o super_admin a escolher um modelo compatível.

---

## [v0.13.5] 2026-05-01 — Catálogo LLM com IDs reais da OpenAI (remove modelos inventados)

> **DEFINITIVO** para o problema "Modelo gpt-5.1-mini não encontrado neste provedor". A causa **real** estava no `PROVIDER_CATALOG` do nosso app, que listava modelos como `gpt-5.1-mini`, `gpt-5.1-nano`, `gpt-5.2`, `gpt-4.1-nano`, `o4-mini`, `o3-mini` — IDs que **não existem na OpenAI**. Foram inventados pelo agente que atualizou o catálogo no v0.11.0 (commit `fae51ae`). A OpenAI sempre retornou 404, e nossa UI mostrava "Modelo X não encontrado" — o que era literalmente verdade, porque o ID não existia em lugar nenhum.

### Como descobri

Validei a lista canônica da OpenAI em [`developers.openai.com/api/docs/models/all`](https://developers.openai.com/api/docs/models/all) (cutoff May/2026). A família GPT-5 que existe oficialmente é: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1` (sem mini/nano), `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5-codex`, `gpt-5.3-codex`, `gpt-5.1-codex-mini`. Variantes não citadas (especificamente "gpt-5.1-mini" puro) não existem.

### O que mudou

- **`PROVIDER_CATALOG.openai.models`** reescrito com os 19 IDs reais da OpenAI. Removidos: `gpt-5.1-mini`, `gpt-5.1-nano`, `gpt-5.2`, `gpt-5.2-mini`, `gpt-4.1-nano`, `o1-mini`, `o3-mini`, `o4-mini`. Adicionados: `gpt-5.5-pro`, `gpt-5.4-pro`, `gpt-5.4-nano`, `gpt-5-nano`, `gpt-5-codex`, `gpt-5.3-codex`, `gpt-5.1-codex-mini`, `o3-pro`, `gpt-4`.
- **`MODEL_PRICING`** alinhado: removidas as entradas de IDs inventados, adicionadas as dos IDs reais.
- **`PROVIDER_CATALOG.openrouter.models`**: removido `openai/gpt-5.1-mini`; adicionado `openai/gpt-5-mini` e mantido `openai/gpt-5.4-mini`.
- **Mensagem de erro** (já v0.13.4) agora mostra body literal da OpenAI **+ sugestão de modelos compatíveis** que a chave do super_admin tem acesso (vindos de `GET /v1/models`). Ex.: tenta `gpt-5.1-mini` → toast diz `OpenAI: The model 'gpt-5.1-mini' does not exist. Sua chave tem acesso a snapshot(s) compatível(is): gpt-5-mini, gpt-5.4-mini`.
- Tests `pricing.test.ts` e `catalog.test.ts` atualizados — incluem assertion que IDs inventados (`gpt-5.1-mini`, `gpt-4.1-nano`, `o4-mini`) **não estão** no catálogo.

### Para o super_admin

A partir desta release o select de Modelo no card "Agente Nex" só mostra IDs que a OpenAI realmente reconhece. **O modelo equivalente ao "GPT-5.1 mini" que você queria é `gpt-5-mini`** (sem o ".1") — esse existe e funciona.

### Outras notas

- Ainda existe `allowCustomModel: true` no catálogo: a opção "Outro (digitar manualmente)" continua disponível pra colar IDs novos da OpenAI quando lançarem.
- 77 suites / 670 tests PASS · typecheck 0 erros.

---

## [v0.13.4] 2026-05-01 — Mensagem real do provider quando o modelo é rejeitado

> Quando o super_admin tenta usar um modelo que a chave da OpenAI não tem acesso (típico em GPT-5.x para contas Tier 1-3), a UI mostrava genericamente "Modelo X não encontrado neste provedor" — sem dizer **se** era nome errado, falta de acesso ou problema na chave. Esta release captura o body literal da resposta da OpenAI e mostra exatamente o que ela disse.

### O que mudou

- **`deepTestOpenAI`** agora trata 404 **e 400** com extração do body. Quando a OpenAI retorna `{ "error": { "message": "The model 'gpt-5.1-mini' does not exist or you do not have access to it" } }`, o toast no card "Agente Nex" passa a mostrar exatamente essa frase (em vez da mensagem genérica do nosso código).
- **`describeErrorKind`** preserva o `fallback` (mensagem do provider) quando `errorKind === "model_not_found"` em vez de sobrescrever pela mensagem padrão.
- O super_admin consegue distinguir três cenários:
  - `you do not have access to it` → conta precisa subir de tier ou pedir acesso ao modelo na OpenAI.
  - `does not exist` → nome do modelo está incorreto.
  - HTTP 400 com outra mensagem → problema no payload (ex.: `temperature` em modelo reasoning) — devolvemos o erro literal pra debug.

### Outras notas

- 77 suites / 670 tests PASS · typecheck 0 erros.

---

## [v0.13.3] 2026-05-01 — Hotfix dashboard ainda quebrado: rollback de getDashboardPeriod/getDashboardSettings

> Após o v0.13.2 (que simplificou o `ConversationsLineChart`), João reportou que o dashboard **continua mostrando "Erro de conexão com o servidor"** — significa que a Server Action `getDashboardData` está lançando exception, não retornando `{success: false, error: ...}`. A causa NÃO era o ConversationsLineChart (já simplificado em v0.13.2). A causa real está em algum dos novos pipelines do v0.13.0: `getDashboardPeriod` + `getDashboardSettings` + `pgPool.query` em tabela `app_settings` JSONB.

### O que mudou no v0.13.3

- **`actions/dashboard.ts` voltou para a lógica simples pré-v0.13.0**: `periodRanges()` interno calcula rolling 24h/7d/30d direto (sem `getDashboardPeriod`, sem `getDashboardSettings`). Tipo `DashboardPeriod` mantido (`"hoje" | "semana" | "mes"`) — o front já usa.
- **`actions/dashboard-drill-down.ts` idem**: `resolvePeriodRanges()` interna sem `getDashboardPeriod` / `getDashboardSettings`.
- **Frontend mostra mensagem de erro REAL** (não mais "Erro de conexão com o servidor" genérico) — `err.message` exposto.

### Implicações funcionais

- **"Semana" volta a ser rolling 7 dias**, não "segunda → hoje". Configuração em `/configuracoes` deixa de ter efeito sobre os filtros (o card UI continua existindo mas é cosmético até o re-fix).
- **"Mês" volta a ser rolling 30 dias**, não "dia 1 → hoje".
- **`comparison.open` continua sendo computado** (mudança em `dashboardData` query continua intacta).
- **Tudo o mais do v0.13.0 continua intacto**: paginação 50/pg, drill-down genérico de status, formatRelativeShort, KpiClickableCard sem overlap, DashboardSettingsCard UI (apesar de cosmético).

### Roadmap

- A causa raiz de `getDashboardPeriod` ou `getDashboardSettings` lançar precisa investigação com **logs do container Portainer** (acesso direto, não via gh API). Será reaplicado em release futura com **smoke test em produção antes do redirect 100% do tráfego**.

### Verificação

- `npm test` 670 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.2] 2026-05-01 — Hotfix dashboard quebrado: ConversationsLineChart simplificado

> Imediatamente após o deploy do v0.13.0, João reportou que o dashboard `/dashboard` não abria — "tem uma mensagem de erro e não aparece nada". A causa foi a reescrita agressiva do `ConversationsLineChart` no v0.13.0 (Pacote H/T11) que combinou: scroll horizontal com largura dinâmica calculada por JS + `<ResponsiveContainer>` aninhado num `<div style={{ width: number }}>` + função `expandFullDay` chamando `Intl.DateTimeFormat` em loop com locale-aware parsing — interação frágil entre recharts ResizeObserver, container scrollable e Tailwind, gerando layout instável ou crash de hidratação dependendo do browser/cache.

### Correção

- **`ConversationsLineChart` voltou a uma versão minimalista**: `<ResponsiveContainer width="100%" height={320}>` em pai sem largura dinâmica, sem scroll horizontal, sem `expandFullDay`, sem `fromZonedTime` no client. Mantém:
  - Sem toggle linha/barra (mantida a remoção do v0.13.0).
  - `tickMargin={12}` no eixo X (mantido o respiro do v0.13.0).
  - Ícone violeta no header (mantido).
- **TZ explícita no SQL bucket continua aplicada** (essa fix do v0.13.0 era segura — só queries server-side).
- **Tudo o resto do v0.13.0 continua intacto**: configurações de dashboard (semana/mês configuráveis), comparison.open, variação relativa em rate, paginação 50/pg, drill-down de status genérico, formatRelativeShort, etc.

### Roadmap

- O scroll horizontal centralizado na hora atual + eixo cheio 0–24h continua sendo um nice-to-have — vamos reaplicar em release futura **com testes visuais reais antes do deploy**, em vez de combinar 4 mudanças complexas no mesmo componente.

### Verificação

- `npm test` 670 testes / 77 suites PASS · typecheck 0 erros · build verde.

---

## [v0.13.1] 2026-04-30 — Backfill BRL no relatório de Consumo do Agente Nex

> Estende o backfill do v0.12.3 para também popular `cost_brl` e `usd_to_brl_rate` em chamadas antigas que estavam com BRL = NULL. Antes desta release, todas as chamadas anteriores ao v0.12.0 mostravam "—" na coluna Custo BRL e contribuíam com R$ 0 nos totais — porque a tabela `llm_usage` não tinha as colunas BRL na época. Agora todos os relatórios de Consumo (KPIs, charts e tabela detalhada) mostram valores em reais para todas as chamadas registradas.

### O que mudou

- **`backfillUsageCosts()` ganhou uma segunda etapa** que aplica `cost_brl = cost_usd × rate_atual` e `usd_to_brl_rate = rate_atual` em todas as rows com `cost_brl IS NULL AND cost_usd > 0`. Idempotente — segunda execução não toca nada porque o filtro `IS NULL` deixa de matchear. Roda automaticamente em `ensureLlmTables()` no primeiro request após o deploy.
- Como **perdemos a cotação histórica de cada chamada** (não foi gravada na época), o backfill aplica a **cotação atual** (commercial × spread cartão, AwesomeAPI cache 4h) — é uma aproximação. Chamadas registradas a partir do v0.12.0 continuam tendo a cotação real do dia da chamada. Apenas as **antigas** ganham essa aproximação retroativa.
- O log do container registra: `[backfill-usage-costs] cost_brl populado em N rows com taxa X.XXXX (live|cache|fallback)`.

### Comportamento da UI após o deploy

- KPI "Custo total": valor BRL agora reflete o total real (USD primário continuou correto desde o v0.12.3).
- Gráficos "Custo por dia / por modelo / Distribuição por provider": rendem em BRL com valores reais.
- Tabela "Chamadas detalhadas": coluna **Custo BRL** mostra `R$ 0,00XXXX` (mín. 3, máx. 6 casas decimais) em todas as chamadas; cotação aplicada disponível no campo `usd_to_brl_rate` (não exibido, mas auditável).

### Outras coisas

- 77 suites / 670 tests PASS · typecheck 0 erros.

---

## [v0.13.0] 2026-04-30 — Dashboard polish: variação relativa, semana/mês inteligentes, drill-downs completos

> Resolve 11 problemas reportados pelo super_admin via screenshots no dashboard `/dashboard` e nos drill-downs dos KPIs, mais 5 melhorias incidentais no `ConversationsLineChart`. A spec passou por dois pente-finos reais (12+5 achados corrigidos) antes da implementação. Implementação via subagent-driven-development com TDD nos helpers puros.

### Novidades

- **Configurações de Dashboard** em `/configuracoes` (super_admin):
  - Início da semana — qualquer dia 0–6 (default: segunda-feira).
  - Modo da semana: **Semana atual** (do dia configurado até hoje) ou **Últimos 7 dias** (rolling).
  - Modo do mês: **Mês atual** (do dia 1 até hoje) ou **Últimos 30 dias** (rolling).
  - Defaults respeitam mês/semana atual — alinhado com a expectativa de "ver o mês que estou vivendo, não 30 dias atrás".
- **Drill-down de status completo** para Resolvido / Pendente / Adiado (antes só "Aberto" tinha drill detalhado; demais mostravam mensagem "será adicionado em uma versão futura").
- **Paginação server-side** (50/pg, cap 200) na lista de conversas dos drill-downs **Recebidas** e **Resolvidas** (era limitada a 20).
- **`comparison.open`** em `dashboardData` — KPI "Abertas" passa a mostrar `±%` vs período anterior, eliminando o badge "Novo".
- **Eixo X cheio 0–24h** no gráfico "Conversas por hora" quando o filtro é "Hoje" — preenche horas vazias com 0/0; scroll horizontal centralizado na hora atual (12h visíveis em desktop, 6h em mobile).

### Mudado

- **Pills de período renomeadas**: `7 dias` → `Semana`, `30 dias` → `Mês`. Tipo `DashboardPeriod` agora é `"hoje" | "semana" | "mes"`.
- **Card "Taxa de resolução"**: indicador troca `pp` por **variação relativa em `%`** (`±X.X%`).
- **`KpiClickableCard`**: hint "Ver detalhes" sai de cima do sparkline (vai para abaixo do trend, alinhado à direita, fade-in em hover/focus). Sem fallback "Novo" — quando não há trend, canto fica vazio.
- **Tabelas dos drill-downs**: tempo relativo curto (`há 2h`, `há 3d`, `há 2m`, `há 2a`) em vez de `há cerca de 2 horas` (corrige aparência de fora-de-ordem do `formatDistanceToNow`).
- **`getOpenDrillDown`** virou **`getStatusDrillDown`** parametrizado por `status: 0|1|2|3`. Wrapper de compat mantém callers antigos com `status=0`.
- **`diffPp` deprecated** em `getResolutionRateDrillDown` — adicionado `diffPct` (variação relativa em `%`). Subtitle do drill-down passa a mostrar valores absolutos atual/anterior + variação.
- **Tooltip do gráfico por hora** (no drill-down "Recebidas" e "Resolvidas"): nome do bucket passa de `14h` para `14:00 – 14:59` (deixa explícita a janela coberta).
- **`ConversationsLineChart`** removeu o toggle linha/barra (mantém só linhas) e passa a usar `tickMargin=12` no eixo X (era colado).

### Corrigido

- **Filtro "7 dias"** agora respeita `dashboard.week_mode` (default = semana atual a partir de segunda-feira; antes era rolling 7 dias fixo).
- **Filtro "30 dias"** agora respeita `dashboard.month_mode` (default = mês atual desde dia 1; antes era rolling 30 dias fixo).
- **TZ ambígua no SQL bucket**: `date_trunc(...)::timestamp` foi trocado por `(date_trunc(...) AT TIME ZONE $tz)` em queries de chart de dashboard/drill-down. Elimina dependência da TZ do processo Node — antes funcionava por sorte (container default UTC).
- **`expandFullDay`** usa `fromZonedTime` (date-fns-tz) — antes seria hack com `getTimezoneOffset()` do navegador.

### Arquivos novos

- `src/lib/dashboard-period.ts` — helper puro `getDashboardPeriod({period, mode, weekStartsOn, tz})` → `{current, prev}`. 9 testes PASS.
- `src/lib/dashboard-settings.ts` — server-only, lê 3 chaves de `app_settings` com cache 60s. 5 testes PASS.
- `src/lib/format/relative-time.ts` — `formatRelativeShort()`. 6 testes PASS.
- `src/components/dashboard/drill-down-pagination.tsx` — paginador reusável.
- `src/components/settings/dashboard-settings-card.tsx` — card de config (super_admin only).
- `src/lib/utils/__tests__/format-bucket.test.ts` — guard test para TZ correctness.

### Compatibilidade

- Cache keys bumped: `dashboard-data-v4`, `dashboard-drill-status-v3`, `dashboard-drill-received-v3`, `dashboard-drill-resolved-v3`, `dashboard-drill-resolution-v3`. Caches anteriores expiram naturalmente em 30s.
- `diffPp` mantido no payload por uma versão (deprecated) — remover em v0.14.0.
- `recent` no drill-down de Recebidas/Resolvidas mantido como alias de `items`.
- `OpenDrillDownData` mantido como alias de `StatusDrillDownData` por uma versão.

### Auditoria

- 670 testes PASS (77 suites). Typecheck 0 erros. Build verde.
- Audit log: `setting_updated` (enum AuditAction existente) com `details.section: "dashboard"`.
- 11 problemas reportados (P1–P11) + 5 do Pacote H (P12–P16) endereçados.

---

## [v0.12.3] 2026-04-30 — Hotfix integração: modelo "não encontrado" + custo zerado + chamadas faltando

> Corrige três bugs reportados pelo super_admin após validar o v0.12.2 em produção: (1) modelos novos como `gpt-5.1-mini` apareciam como "não encontrado neste provedor" mesmo existindo, (2) chamadas antigas mostravam custo `$0.000` no relatório, (3) o painel de Consumo contava menos chamadas do que o dashboard oficial da OpenAI.

### Bug fixes

- **"Modelo gpt-5.1-mini não encontrado neste provedor".** `deepTestOpenAI` rejeitava o modelo no pré-check `GET /v1/models` porque a OpenAI lista **snapshots datados** (`gpt-5.1-mini-2025-12-01`) e não aliases curtos (`gpt-5.1-mini`). O alias é válido no `POST /v1/chat/completions`, mas o pré-check fazia `ids.includes(model)` e rejeitava. **Fix:** `GET /v1/models` agora valida apenas a chave (401 = inválida); a validação do modelo fica para o `POST /v1/chat/completions`, que retorna 404 se o modelo realmente não existe — único caminho confiável de validação.
- **Custos `$0,000` em chamadas antigas no relatório de Consumo.** Antes do v0.12.1, `MODEL_PRICING` não tinha entradas para `gpt-4.1-mini`, `gpt-5.x`, `claude-4.7`, etc., então `calculateCost` retornava 0 e zero foi gravado no banco. **Fix:** nova função `backfillUsageCosts()` chamada automaticamente em `ensureLlmTables()` recalcula `cost_usd` (idempotente: só atualiza rows com `cost_usd = 0` cujos modelos agora têm pricing). `cost_brl` das chamadas antigas continua `NULL` (não dá pra recuperar a cotação histórica) — UI mostra "—".
- **Discrepância "5 chamadas" no nosso painel vs "7 chamadas" no dashboard da OpenAI.** `runNexAgent` agregava todas as iterações de tool-calling de uma conversa em **uma única row** em `llm_usage`, enquanto a OpenAI conta **cada `POST /v1/chat/completions` separadamente**. Conversa com 3 tool calls = 3 linhas no dashboard deles, 1 linha no nosso. **Fix:** agora registramos `logUsage` **por iteração**, alinhando exatamente com a contagem do provider.

### Como medimos tokens e custo (resposta documentada)

1. **Tokens** vêm do campo `usage` retornado pela API do provider em cada `POST /v1/chat/completions` (OpenAI), `POST /v1/messages` (Anthropic), etc. Não há cálculo local — usamos exatamente o que o provider mediu (mesma fonte que o dashboard deles).
2. **Custo USD** é calculado localmente: `cost_usd = (tokens_input × input_price + tokens_output × output_price) / 1.000.000`. Os preços vêm da tabela `MODEL_PRICING` em `src/lib/llm/pricing.ts` (atualizada em v0.12.1 para abril/2026 com OpenAI GPT-4.1.x/5.x/o3/o4, Anthropic Claude 4.5/4.7, Gemini 2.5). Os providers **não retornam o custo em dólar diretamente** — cada um expõe só os tokens; o custo é responsabilidade do consumidor.
3. **Precisão** é `DECIMAL(10, 6)` no banco — 6 casas decimais. Chamadas sub-centavo (ex.: `$0,000838`) preservam todos os dígitos. UI exibe com mínimo 3 e máximo 6 casas.
4. **Custo BRL** é `cost_usd × usd_to_brl_rate`, onde `usd_to_brl_rate` é a cotação cartão de crédito capturada **no momento da chamada** (commercial × spread, AwesomeAPI cache 4h).
5. **Por que não usar o endpoint `/v1/organization/usage` da OpenAI?** Ele exige uma chave admin separada (não a project key), tem delay de horas/dias e só funciona pra OpenAI — não pra Anthropic/Gemini/OpenRouter. Capturar `usage` no response da chamada é o padrão de mercado e o único método que cobre todos os providers de forma uniforme e em tempo real.

### Outras coisas

- `npm test` 77 suites / 671 tests PASS, typecheck 0 erros.

---

## [v0.12.2] 2026-04-30 — Hotfix crítico: "use server" file só pode exportar funções async

> Causa raiz finalmente identificada do crash "This page couldn't load — A server error occurred" reportado pelo super_admin ao trocar modelo, renomear chave, criar nova chave, ou qualquer mutação de credencial. O sintoma era global e persistia mesmo após o hotfix v0.12.1 (que tratou GPT-5.x params, mas não mexia neste vetor).

### Causa raiz (Next.js 16)

O Next.js 16 valida em runtime que **todo arquivo com diretiva `"use server"` exporte APENAS funções async**. Qualquer outro export (constante, número, objeto, re-export de variável) faz o Next.js abortar a renderização com:

```
⨯ Error: A "use server" file can only export async functions, found number.
  digest: '4181178278@E352'
```

Logo, **qualquer Server Action invocada** (não importa qual arquivo `"use server"`, pois o erro é no carregamento do módulo da action) explode com a tela full-screen "This page couldn't load" + logout.

O culpado: `src/lib/actions/exchange-rate.ts:93` tinha `export { DEFAULT_CARD_SPREAD };` (constante numérica `1.1`), introduzido no T8 da v0.12.0 como conveniência para o consumer. Embora o build TypeScript passasse normalmente (e os testes Jest também), o runtime do Next.js rejeitava o módulo no momento da invocação.

### Fix

- Removido o `export { DEFAULT_CARD_SPREAD }` do arquivo `"use server"`.
- Os consumers (apenas `src/app/(protected)/configuracoes/page.tsx`) já importam `DEFAULT_CARD_SPREAD` direto de `@/lib/llm/exchange-rate` (módulo regular, não `"use server"`) — nenhuma mudança necessária no consumer.
- Comentário inline no arquivo da action documenta a regra para evitar reincidência.

### Detecção

Logs do container em produção (via `gh workflow run portainer-debug.yml -f action=logs-app`) mostravam o stack trace literal — investigação feita após dois relatos consecutivos do mesmo sintoma.

### Aviso ao próximo agente

**REGRA**: arquivos `"use server"` (`src/lib/actions/**/*.ts`) devem exportar **somente** funções `async` (Server Actions) e/ou tipos/interfaces TypeScript (que são apagados no build). **Nunca** re-exporte constantes, objetos, classes ou funções síncronas a partir desses arquivos — Next.js 16 rejeita em runtime mesmo passando no build/typecheck/jest.

### Outras coisas desta release

- Inalterado todo o resto da v0.12.1 (abas Agente Nex, GPT-5.x params, MODEL_PRICING, visibility, overscroll). Tests 74 suites / 650 PASS.

---

## [v0.12.1] 2026-04-30 — Hotfix Agente Nex + UX cleanup + visibility/overscroll bugs

> Hotfix imediato sobre v0.12.0. Corrige crash crítico ao trocar para modelos GPT-5.x, atualiza tabela de preços abril/2026 (custos paravam zerados), unifica os cards "Agente Nex" e "Chaves de API" em abas internas, libera o spread cartão (sem limite superior), corrige bug de visibilidade Matrix IA "Ninguém" sendo ignorada para super_admin, remove toggles duplicados do card Visibilidade e elimina a "tarja preta" de overscroll que aparecia em toda a plataforma.

### Bug fixes (críticos)

- **Crash "This page couldn't load" ao trocar modelo (P1).** Modelos da família GPT-5.x e o-series (`o1`, `o3`, `o4`) rejeitam `max_tokens` e `temperature: 0`. `deepTestOpenAI` e `OpenAIClient.chat` agora detectam reasoning models e usam `max_completion_tokens` sem `temperature`. Sintoma do usuário: ao trocar de `gpt-4.1-mini` para `gpt-5.1-mini` e clicar Testar/Salvar → tela de erro full-screen + logout.
- **Custos zerados no Consumo do Agente Nex (P2).** `MODEL_PRICING` ganhou GPT-4.1.x, GPT-5.x, o3/o4-mini, Claude 4.5/4.7 (Sonnet/Opus/Haiku), Gemini 2.5 (Pro/Flash/Flash-Lite), Gemini 2.0 Pro e aliases OpenRouter. Modelos novos não mapeados continuam retornando 0 (sem regressão), mas todos os modelos do `PROVIDER_CATALOG` 2026 agora têm preço.
- **Bug visibility "Ninguém" não respeitada (P7).** `shouldExcludeMatrixIA()` ignorava `reports.matrix_ia_visibility = 'none'` para super_admin (sempre incluía). Reescrito para respeitar os 3 níveis: `none` exclui para todos (inclusive super_admin), `super_admin_only` exclui exceto super_admin, `all` inclui para todos.
- **Tarja preta no overscroll (P8).** Em qualquer rota, ao rolar até o fim e continuar puxando, aparecia uma área preta (#000) além do conteúdo. Causa: `<html>` sem `bg-background` deixava o user-agent pintar a área de elastic-bounce com preto puro do `colorScheme: dark`. Aplicado: `bg-background` no `<html>`, `overscroll-contain` no `<main>` do layout protegido e `overscroll-behavior-y: none` global.

### Mudado

- **Card "Agente Nex" com abas internas Configuração/Chaves (P3).** O card "Chaves de API" foi removido da página `/configuracoes` e seu conteúdo virou uma aba dentro do próprio card "Agente Nex". Segmented control no topo alterna entre a aba "Configuração" (toggle bolha, status, provider/model/chave, spread) e "Chaves de API" (CRUD por provedor). Ao clicar "+ Nova chave" no select, a aba muda automaticamente.
- **Spread cartão sem limite superior (P4).** Removido o range `[1.00, 1.30]`. Agora aceita qualquer valor positivo (`> 0`). Help text atualizado: "Sem limite superior — escolha o valor real do seu cartão."
- **Custos exibidos com 3 casas decimais mínimas (P5).** `usdFmt`/`brlFmt` agora têm `minimumFractionDigits: 3` (era 4). `maximumFractionDigits: 6` mantido — valores sub-centavo ainda aparecem com mais casas para não virar zero. Visualmente menos poluído nos KPIs e charts.
- **Card "Visibilidade" sem toggles Matrix IA duplicados (P6).** Removidos os 2 switches "Matrix IA visível somente para super admin" e "Excluir Matrix IA das métricas globais" — a regra granular já vive no card "Incluir Matrix IA nos relatórios" com select 3-níveis (`all` / `super_admin_only` / `none`). O card "Visibilidade" agora tem apenas CSAT e SLA. Backward-compat: as chaves antigas (`feature_flags.matrix_ia_*`) continuam no banco e `getMatrixIAVisibility()` ainda as lê como fallback.

### Resilência (defensive)

- **Server Actions LLM não vazam mais exceção pro client.** Wrapper `safeAction` em todas as 9 actions de `llm-config.ts` e `llm-credentials.ts`. Qualquer exceção inesperada vira `{ ok: false, error: "Erro inesperado: …" }`, evitando que o Next.js mostre "This page couldn't load" full-screen + deslogue o usuário.
- **`ALTER TYPE "AuditAction" ADD VALUE` em try/catch isolado.** Se algum ambiente bloquear o ALTER por idiosincrasia (lock, transação implícita), só loga warning e segue — não quebra `ensureLlmTables`.

### Removido

- `src/lib/reports/matrix-ia-setting.ts` — sem consumers após o refactor de `shouldExcludeMatrixIA`.
- `src/components/settings/llm-credentials-card.tsx` — substituído por `llm-credentials-manager.tsx` (sem wrapper Card; usado dentro do `LlmConfigCard` na aba "Chaves").

---

## [v0.12.0] 2026-04-30 — Agente Nex: credenciais gerenciáveis + custo BRL com cotação cartão

> Reformulação completa da configuração e do consumo do Agente Nex. Adiciona credenciais (API keys) como recurso de primeira classe com CRUD por provedor, captura cotação USD→BRL cartão de crédito em cada chamada, e padroniza a nomenclatura para "Agente Nex" em todos os call-sites. Trocar modelo ou provedor não exige mais re-digitar a chave.

### Adicionado

- **Card "Chaves de API"** em `/configuracoes` (super_admin). 4 seções (uma por provedor: OpenAI, Anthropic, Gemini, OpenRouter). Cada chave aparece com label, "••••XXXX" e ações inline: Renomear, Trocar (rotação preserva ID e label), Deletar. Ponto verde marca a chave em uso pelo Agente Nex. Botão "+ Nova" abre dialog reutilizável com label opcional (autogera "Chave 1", "Chave 2", …) e PasswordInput. Tem opção de testar conexão antes de salvar.
- **Custo BRL no Consumo do Agente Nex.** Card "Custo total" mostra agora R$ como valor primário com USD em fonte menor (≈ $X.XXXX USD). Charts (Custo por dia, Custo por modelo, Distribuição por provider) e tabela de chamadas detalhadas usam BRL primário. Tabela ganhou coluna "Custo BRL" ao lado de "Custo USD".
- **Cotação USD→BRL cartão de crédito** capturada no momento de cada chamada do Agente Nex (`llm_usage.usd_to_brl_rate`). Fonte: AwesomeAPI (`https://economia.awesomeapi.com.br/last/USD-BRL`) com cache de 4h em `app_settings.llm.usd_brl.rate_cache`. Spread cartão configurável (`app_settings.llm.usd_brl.card_spread`, default `1.10`, range `[1.00, 1.30]`). Fallback 5.50 quando AwesomeAPI indisponível e sem cache.
- **Campo "Spread cartão"** no card "Agente Nex" (input numérico, debounce 500ms, valida range). Tooltip explica "Multiplicador aplicado sobre a cotação comercial USD/BRL (default 1.10 ≈ IOF + spread Visa/Master)".
- **Runbook** `docs/runbooks/credenciais-llm.md` — passo-a-passo para criar/rotacionar/deletar credenciais e ajustar spread cartão.
- **Auditoria** ganha actions `credential_created`, `credential_updated`, `credential_deleted`, `credential_tested`.

### Mudado

- **"Agente IA" → "Agente Nex"** em todos os call-sites (card título, página `/configuracoes/consumo`, mensagens de erro do agente, empty-states). `grep -rn "Agente IA" src/` agora retorna vazio.
- **Card "Agente Nex"** (`/configuracoes`) não exige mais re-digitar API key para trocar modelo ou provedor. Campo "API key" foi substituído por um `select` de credenciais salvas para aquele provedor (mais opção "+ Nova chave"). Trocar provedor pré-seleciona automaticamente a credencial mais recente do novo provedor; se não houver, força criação. Botões "Testar conexão" e "Salvar configuração" usam `credentialId` em vez de chave inline.
- **Custos exibidos com mínimo 4 casas decimais** em todas as visualizações (KPI, charts, tabela). Dropei o formatador `usdFmtCompact` (2-4 casas) que escondia valores sub-centavo, agora padronizado em `usdFmt`/`brlFmt` com 4-6 casas.
- **`KpiCard.value`** aceita `ReactNode` (era `string | number`) — habilita layouts com 2 linhas (BRL primário + USD secundário no card "Custo total").

### Schema (runtime via `ensureLlmTables`, idempotente)

- **NOVA tabela** `llm_credentials (id UUID PK, provider TEXT, label TEXT, encrypted_api_key TEXT, last4 TEXT, created_at, updated_at, created_by_id UUID NULL)`. Índices: `UNIQUE(provider, label)` e `(provider, updated_at DESC)`. Chave cifrada com AES-256 (`@/lib/encryption`).
- **`llm_configs.credential_id UUID NULL`** — FK lógica para `llm_credentials.id`.
- **`llm_configs.encrypted_api_key`** virou `NULLABLE` (era NOT NULL). Mantida em rows existentes para permitir rollback para v0.11.x; em v0.13.0 será dropada.
- **`llm_usage.cost_brl DECIMAL(12,6) NULL`** e **`llm_usage.usd_to_brl_rate DECIMAL(10,4) NULL`**.
- **Enum `AuditAction`** ganha `credential_created`, `credential_updated`, `credential_deleted`, `credential_tested` (via `ALTER TYPE … ADD VALUE IF NOT EXISTS`).

### Migração de dados

- Idempotente, dentro de `ensureLlmTables()` na primeira request após o deploy. Para cada `llm_configs` com `credential_id IS NULL AND encrypted_api_key IS NOT NULL`: cria entrada em `llm_credentials` com label "Chave principal" (ou "Chave principal 2" se já existir) e popula `credential_id`. Em caso de `decrypt` falhar numa row corrompida, loga warning e segue (super_admin re-cadastra manualmente).

### Compatibilidade & rollback

- Deploy zero-downtime: pod novo aplica migração na primeira request; pod antigo continua lendo `encrypted_api_key` direto até o cutover. `getActiveLlmConfig` faz fallback para `encrypted_api_key` quando `credential_id` é NULL.
- Rollback para v0.11.x: backend antigo ignora colunas/tabela novas. Chaves antigas continuam em `llm_configs.encrypted_api_key`.

---

## [v0.11.1] 2026-04-30 — Hotfix: página de configurações e relatórios não carregavam

> "This page couldn't load — A server error occurred" em todas as páginas internas (`/configuracoes`, todos os `/relatorios/*`, perfil, etc).

### Causa raiz

O commit `0a3bfab` (`fix(conversas): page-header mede altura + toolbar fluid (v0.10.4 prep)` — agente `claude-conversas-v0.10.4-fix`) marcou `src/components/page-header.tsx` como `"use client"` para usar `useLayoutEffect`. Mas o componente recebe `icon: LucideIcon` (função/forwardRef), e funções **não podem ser passadas** de Server Component para Client Component (regra do Next.js RSC). Resultado: toda página interna que renderizava `<PageHeader icon={Settings} ... />` quebrava no SSR com `Error: Functions cannot be passed directly to Client Components`.

### Fix

Refatoração interna sem mudar a API pública:

- **`src/components/page-header.tsx`** — volta a ser Server Component, **mantém os mesmos props** (`icon: LucideIcon`, `title`, `subtitle`, `actions`). O ícone é renderizado no servidor e o JSX resultante é entregue como `children` para o filho client.
- **`src/components/page-header-height-probe.tsx`** (novo) — Client Component pequeno (`"use client"`) que recebe `children` já renderizado e ata o `useLayoutEffect + ResizeObserver` que mede a altura e exporta a CSS var `--page-header-h`. Recebe ReactNode (não funções), atravessa a fronteira sem problema.

13 call-sites continuam usando exatamente a mesma API. Sem mudanças nas páginas.

### Lições / processo

- O agente que fez `0a3bfab` deveria ter testado uma página com PageHeader antes de pushar — `npm run build` teria capturado o erro.
- O protocolo de coordenação multi-agente já tem checklist "antes de push: gh run list + curl /api/health". Não capturou esse caso porque `/api/health` continuava verde (Server Component só falha quando renderiza). Adicionar ao checklist: **abrir uma página interna logada antes de declarar deploy bem-sucedido**.

---

## [v0.11.0] 2026-04-30 — Visibilidade granular + catálogo LLM atualizado

> Substitui os toggles boolean dos relatórios e do Matrix IA por dropdowns de **3 níveis** (Todos / Somente super admin / Ninguém) com aplicação **global** em sidebar, páginas, queries, filtros e dropdowns. Inclui também o catálogo LLM atualizado (cutoff abril/2026) com famílias GPT-5.x, Claude 4.7, Gemini 2.5 e OpenRouter expandido. Corrige 2 bugs no card Agente Nex.

### Visibilidade granular

- **Tipo `Visibility`** em `src/lib/reports/visibility.ts` (`"all" | "super_admin_only" | "none"`) com helpers servidor-side: `resolveVisibility`, `getReportVisibility`, `getMatrixIAVisibility`, `isReportVisibleForUser`, `isMatrixIAVisibleForUser`, `getVisibleReportKeys`. Cache TTL 30s.
- **Backward-compat** transparente para deployments existentes: lê `platform.enabled_reports` e `reports.include_matrix_ia` quando as chaves novas não existem.
- **Persistência:** chaves novas em `app_settings` (sem migration de schema):
  - `reports.visibility.<report-key>` (7 chaves: visao-geral, performance, equipe, distribuicao, origem-ia, conversas, mensagens-nao-respondidas).
  - `reports.matrix_ia_visibility`.
- **UI primitivo** `<VisibilitySelect>` (3 opções com ícones lucide Users/Shield/EyeOff). Usa o `<CustomSelect>` (base-ui Popover.Portal) — sem o bug de "preso em container".
- **Cards refatorados** (`enabled-reports-card`, `matrix-ia-toggle-card`): switches → VisibilitySelect; footer mostra distribuição all/super_admin/none.
- **Aplicação global**:
  - **Sidebar** filtra links por role via `getVisibleReportKeys(role)`.
  - **7 páginas `relatorios/<key>/page.tsx`** com guard `redirect("/dashboard")` quando o role não tem acesso.
  - **`getInboxesForUser`** esconde inbox 31 (Matrix IA) automaticamente quando `isMatrixIAVisibleForUser(role) === false` — afeta dropdowns de filtros, drill-downs e queries derivadas.
- **Seed** (`prisma/seed.ts`) ganha 8 entradas com defaults `"all"` (relatórios) e `"super_admin_only"` (Matrix IA).

### Catálogo LLM (cutoff abril/2026)

- **OpenAI**: 18 modelos. Família **GPT-5.5 / 5.4 / 5.4 mini / 5.2 / 5.1 / 5.1 mini / 5 / 5 mini** + reasoning (o4-mini, o3, o3-mini, o1, o1-mini) + GPT-4.1 family + GPT-4o family. Atualmente mais novo: GPT-5.5.
- **Anthropic**: 9 modelos. **Claude Opus 4.7** (atual mais novo) + **Sonnet 4.7** (novo) + Sonnet 4.6 / 4.5 / Opus 4.5 + Haiku 4.5 + 3.5 family (Sonnet/Haiku) + Opus 3.
- **Google Gemini**: 9 modelos. **2.5 Pro / Flash / Flash Lite** no topo + **2.0 Pro** (novo) + 2.0 Flash / Flash Lite + 1.5 Pro/Flash/Flash-8B.
- **OpenRouter**: 40 modelos curados, cobrindo Free (Llama 3.3 70B free, DeepSeek R1 free, Qwen 2.5 7B free, Phi-3 Mini free), Low (todos os mini do top tier), Medium (4o, 5, Sonnet 4.5/4.6/4.7, DeepSeek R1), High (o3, GPT-5.4/5.5, Opus 4.5/4.7, Gemini 2.5 Pro, Llama 3.1 405B, Mistral Large, Cohere R+).
- `allowCustomModel: true` cobre o long-tail (digitação manual de IDs).

### Bug fixes UI

- **Dropdown de Modelo no card Agente Nex** estava preso visualmente dentro do container — `<SearchableSelect>` migrado de `<div absolute>` custom para `<Popover>` da base-ui (Portal automático via `PopoverContent`).
- **Olhinho da API key descentralizado** — `<PasswordInput>` trocou `top-1/2 + translate-y(-50%) + h-6 w-6` por `inset-y-0 + flex items-center justify-center + w-10`. Centraliza em qualquer altura de input.

### Testes

- **+17 novos** testes (14 visibility helpers + 3 VisibilitySelect). Total da suite: 551/551 verdes.

### Out of scope

- Permissões mais granulares por persona (manager vs viewer) — fica para v0.12.
- Botão "redefinir defaults" no settings — YAGNI.

---

## [v0.10.4] 2026-04-30 — Conversas: scroll interno + 100/Todos infinite scroll + remove colunas WhatsApp/Atributos

> Hotfix em resposta a feedback do João sobre v0.10.3: page header + toolbar + thead realmente fixos (só linhas da tabela rolam internamente); page size simplificado pra 2 opções com infinite scroll automático no "100"; colunas WhatsApp e Atributos removidas da grade e do `<ColumnsToggle>` (continuam disponíveis no drill-down ao clicar na linha — esse comportamento NÃO mudou).

### Mudou

- **Scroll interno da tabela** — container do `<tbody>` ganhou `max-h: calc(100dvh - var(--page-header-h, 96px) - var(--toolbar-h, 200px) - 64px)` + `overflow-y-auto`. `<thead>` agora é `sticky top-0` LOCAL ao container (não mais ao viewport). Toolbar de filtros perdeu `position: sticky` — vive no fluxo natural acima da tabela. Resultado: rolar a página rola só as linhas da tabela; page header + toolbar + thead ficam estáticos.
- **`<PageHeader>` mede a própria altura** via `useLayoutEffect` + `ResizeObserver` e exporta `--page-header-h` no `<html>`. Permite o cálculo de altura da tabela respeitar headers customizados (ex.: subtítulo longo).
- **Page size simplificado** — opções reduzidas de 3 (`50/100/Todos`) para 2 (`100/Todos`). Default `100`. Usuários antigos com `"50"` em localStorage migram automaticamente para `"100"`.
- **Infinite scroll** quando `pageSize === "100"` — sentinela invisível no fim do `<tbody>` dispara `loadMore` via `IntersectionObserver` (`rootMargin: 200px`). Usuário não precisa mais clicar "Carregar mais" — rola e a tabela cresce. Botão "Carregar mais" mantido como fallback (browsers sem IntersectionObserver e/ou estado de erro).
- **Colunas removidas** — `phone` ("WhatsApp") e `custom_attributes` ("Atributos") deletadas do array `COLUMNS` em `<ConversasTable>`. Saem da grade e do `<ColumnsToggle>` (que era 15/15, agora reflete o novo total). `phone` também sai de `SORT_OPTIONS` em `<AdvancedFilters>` (não há mais coluna pra ordenar).

### Não mudou (importante)

- **Drill-down `<ConversaDrillDown>`** — continua mostrando WhatsApp formatado completo + atributos chave:valor sem reticências + botão "Abrir no Chatwoot". Click na linha continua expandindo do mesmo jeito.
- **Mobile cards** (`lg:hidden`) — continuam mostrando WhatsApp via `<Field label="WhatsApp">`. Layout mobile não muda nessa release.

### Verificação

- `npx tsc --noEmit` → exit 0
- `npx jest src/components/reports` → 44/44 passing
- `npm run build` → OK

---

## [v0.10.3] 2026-04-30 — Conversas: hotfix UI (toolbar + sticky + filtros + tour)

> Hotfix em resposta a feedback do João sobre v0.10.1: toolbar com cantos retos destoava do card da tabela, sticky thead "pulava" para baixo na carga inicial, FiltersDialog Modo Simples sem mutex inflava sem fim, Modo Avançado com label duplicada, sem scroll interno; "Limpar filtros/ordenação" só link de texto sem ícone; tour com botão "Próximo" e "1 de 11" quebrando linha.

### Mudou

- **Toolbar arredondado** — `<AdvancedFilters>` agora usa `rounded-2xl + border + shadow-sm` igual ao card da tabela. Antes era `border-b` único, sem cantos.
- **Sticky thead garantido na primeira pintura** — `useLayoutEffect` síncrono mede o toolbar e seta `--toolbar-h` antes do paint. Antes o thead "pulava" para baixo no primeiro frame porque o fallback (132px) era diferente da altura real medida só no useEffect (depois do paint).
- **FiltersDialog Modo Simples — accordion mutex** — ao abrir uma seção (Caixa de entrada, Departamento, etc), as outras fecham automaticamente. Evita o "nhocão" reclamado quando várias seções ficavam abertas e o dialog crescia sem fim.
- **FiltersDialog tamanho + scroll interno** — `max-w-[1100px]` (era 920), `max-h-[85vh]`, header e footer fixos, body com `overflow-y-auto` interno. Funciona pra Simples e Avançado.
- **Modo Avançado — label do valor sem duplicação** — `ConditionRow` passa `label="Valor"` para o `<MultiSelectCheckbox>` em vez de repetir o label do campo (que já está visível no `<select>` à esquerda). Antes mostrava "Caixa de entrada" no select e "Caixa de entrada" de novo no popover do valor.
- **Modo Avançado — separação visual de grupos** — grupos aninhados ganham `border-l-2 border-violet-500/40 + bg-violet-500/[0.02]` em vez do card cinza genérico. Cada `ConditionRow` ganha `bg-card`, `h-9` nos selects e botão remover com `hover:text-destructive`.
- **`STORAGE_COLS` cols-v2 → cols-v3** — migration agressiva remove `phone`, `document`, `labels`, `custom_attributes`, `created_at`, `last_activity_at` mesmo se o usuário tinha re-marcado pelo `<ColumnsToggle>` depois da v0.9.0. Resolve o "WhatsApp ainda aparecendo na grade" pra usuários que tinham reativado.
- **"Limpar filtros" / "Limpar ordenação"** — agora botões pill com ícone Trash2 + hover destructive. Antes eram links de texto sublinhados sem ícone.
- **Tour overlay** — popover de 360px → **440px**; footer reorganizado em 2 linhas (dots + "N de M" em cima, botões Pular/Voltar/Próximo embaixo) com `flex-wrap` e `whitespace-nowrap` nos botões. Antes "1 de 11" quebrava a linha porque concorria com 3 botões em 360px.

### Verificação

- `npx tsc --noEmit` → exit 0
- `npx jest` → 531/531 passing (63 suites)
- `npm run build` → OK

---

## [v0.10.2] 2026-04-30 — Dashboard fix de UX (drill central, status compacto, "Abrir no Chatwoot")

> Hotfix de UX do dashboard v0.10.0 a partir do feedback do João: drill-down não estava centralizando direito (parecia side-sheet quebrado), toggle bar/donut atrapalhava a leitura, donut de status ocupava bloco gigante com pouco conteúdo, faltava botão "Abrir no Chatwoot" nas tabelas, faltava afordância visual de click nas barras, e a seção "Conversas recentes" no fim não trazia valor.

### Corrigido

- **Drill-down dialog não centralizava no desktop** — `inset-x-0` mobile-first conflitava com a centralização desktop (`inset-x-0` define `left:0` e `right:0`, impedindo `left-1/2 + translate`). Reescrito posicionamento usando `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` para todas as breakpoints. Agora abre **no centro** da viewport com o tamanho correto.

### Mudou

- **Removido toggle bar/donut** dos cards de Inboxes e Departamentos — fica **bar-only** (mais legível para ranking, suporta qualquer número de categorias). João: "tem que ser um ou outro".
- **Status distribution card compactado** — antes era um bloco full-width com donut centralizado e legenda em baixo, ocupando muito espaço pra pouca informação. Agora: donut compacto à esquerda (220×220) + legenda clicável à direita com label, %, contagem e seta `→`. Cada linha da legenda dispara o drill-down.
- **Cards de distribuição (Inbox e Departamento) ganharam hint visual** — subtítulo "🖱 Clique numa barra para ver as conversas" deixa claro que a tabela é interativa.
- **Removida seção "Conversas recentes"** do dashboard — não trazia valor próximo aos demais cards. Conversas seguem disponíveis em `/relatorios/conversas` e via drill-downs (todas com botão "Abrir no Chatwoot").
- **Tour atualizado** — passo "recent" removido; "status" ganhou cópia indicando que a legenda é clicável.

### Adicionado

- **Botão "Abrir no Chatwoot"** em todas as tabelas de drill-down do dashboard (Recebidas, Resolvidas, Abertas, Sem-resposta, Por departamento) e na lista preview do `<NoResponseCard>`. Reusa `<OpenInChatwoot>` (`src/components/reports/open-in-chatwoot.tsx`).

### Verificação

- `npx tsc --noEmit` — verde nos arquivos do dashboard.
- `npx eslint src/components/dashboard src/components/ui/drill-down-dialog.tsx` — sem warnings.

---

## [v0.10.1] 2026-04-30 — Conversas: presets + atalhos rápidos + polimento

> Complementos da v0.9.0/v0.9.1 — pendências do feedback do João: filtros salvos, atalhos rápidos, migração de localStorage cols (corrige WhatsApp aparecendo na grade pra usuários antigos), polimento touch-target em mobile. (Originalmente planejado como v0.9.2 — promovido a 0.10.1 porque o release v0.10.0 do dashboard caiu antes.)

### Adicionado
- **Filtros salvos (presets)** — `<PresetsPopover>` no toolbar com CRUD: salvar atual, listar, aplicar (1 click), renomear, excluir. Cap 50 presets. Persistência em `localStorage["conversas-filter-presets"]`. Cada preset guarda `FilterState` completo + `sortStack`.
- **Atalhos rápidos** — `<QuickFiltersPopover>` (botão "Atalhos") no toolbar com 3 toggles: "Sem resposta" (filtra `waiting_seconds > 0`), "Não atribuídas" (`assignee.id IS NULL`) e "Minhas" (oculto enquanto `User.chatwoot_user_id` não estiver mapeado). Multi-toggle (combinador AND). Compõe via `mergeConditionGroups` com o conditionGroup do modo Avançado.
- **`useMigratedLocalStorageSet`** — hook genérico de migração de keys de localStorage com transformação. Usado para `conversas-table-cols-v2`.
- **`useFilterPresets`** — hook CRUD de presets com validação (nome obrigatório, único, ≤60 chars; cap 50).
- **Step novo no tour de Conversas** apontando para o botão Presets.

### Mudou
- **`STORAGE_COLS`** — `conversas-table-cols` → `conversas-table-cols-v2`. Migration one-shot remove keys que migraram para drill-down em v0.9.0 (`phone, document, labels, custom_attributes, created_at, last_activity_at`). Usuários antigos ficam com layout correto sem perder customizações legítimas.
- **Touch-target em mobile** — "Ver mais" no drill-down `h-7 → h-8`; chips com `min-h-9` e X em `h-6 w-6`.

### Verificação
- `npx tsc --noEmit` → exit 0
- `npx jest` → 531/531 passing (testes novos: `use-migrated-local-storage` 5, `quick-filters` 8, `use-filter-presets` 6, `presets-dialog` 4)

## [v0.10.0] 2026-04-30 — Dashboard Pulse

> Redesign completo da home `/dashboard`. KPIs, gráficos e drill-downs agora **falam da mesma coorte** (criadas no período), o **timezone** respeita a plataforma, o **seletor de conta deixou de ser duplicado** (vive só no sidebar) e cards de listas viraram **gráficos clicáveis** com drill-down em **modal central**. Spec/plan em `docs/superpowers/{specs,plans}/2026-04-30-dashboard-v0.10*.md`.

### Adicionado

- **Card "Conversas sem resposta agora"** (hero) — definição estrita: status=0 + última mensagem do contato (`message_type=0`). Mostra contador, "mais antiga há X" e preview de 5 com CTA "Ver todas" que abre drill-down central com agrupamento por inbox/atendente.
- **Distribuição por Departamento** clicável — bar/donut com toggle (`<ChartTypeToggle>`). Coorte: criadas no período + status ∈ {open, pending, snoozed}. Bucket "Sem departamento" sempre visível quando há conversas com `team_id IS NULL`. Click na barra/fatia abre drill-down com lista filtrada.
- **Distribuição por Inbox** clicável — bar/donut com toggle. Coorte: criadas no período + status=0.
- **Distribuição por Status** — donut com 4 fatias (Aberto/Pendente/Adiado/Resolvido), centro mostra total recebido. Click vai para drill-down do status (Open com lista completa, demais com texto explicativo enquanto o drill específico não chega em v0.11).
- **Toggle line/bar** no chart de "Conversas por hora/dia" via `<ChartLineBarToggle>`, persistido em `localStorage`.
- **`<DrillDownDialog>`** — modal centralizado de até 1280px (`max-w-6xl`) e 90dvh (mobile vira full-screen). Substitui o side-sheet (`<DrillDownSheet>`) no dashboard; outros relatórios continuam com side-sheet.
- **`<ChartTypeToggle>`** e `useChartTypeStorage` — segmented control bar/donut com persistência localStorage e bloqueio automático de donut acima de 6 categorias.
- **`<NoResponseCard>`** + drill-down `<NoResponseDrillDownContent>` (lista completa até 100, agrupável).
- **`<TeamDrillDownContent>`** — drill-down de departamento com donut por status + lista.
- **Backend**: `getNoResponseDrillDown` e `getByTeamDrillDown` em `dashboard-drill-down.ts` (com bucket "Sem departamento").
- **`formatBucketLabel(iso, granularity, tz)`** — formatter TZ-aware via `Intl.DateTimeFormat` em `src/lib/utils/format-bucket.ts` + tests (4 cenários incluindo Asia/Tokyo).
- **`onBarClick`/`onSliceClick`** opcionais em `InteractiveBarChart`, `InteractivePieChart`, `DonutWithCenter`.

### Mudou

- **KPIs amarrados ao filtro de período** (mesma coorte):
  - "Recebidas" — created_at ∈ período (já era).
  - "Resolvidas" — created_at ∈ período + status=1 (era last_activity_at; mudança para coorte única).
  - "Abertas" — created_at ∈ período + status=0 (era snapshot global; mostrava 1.475 com "Hoje" — agora respeita o filtro).
  - "Taxa de resolução" — `min(100, resolvidas/recebidas * 100)` (era >100% por coortes diferentes).
- **`getResolvedDrillDown`** e **`getOpenDrillDown`** atualizados para mesma coorte de criação no período. `getOpenDrillDownAction` agora aceita `period`.
- **Top inboxes em aberto** — passou de snapshot global para coorte do período (limite ampliado de 5 para 10).
- **Chart "Conversas por hora"** usa `Intl.DateTimeFormat` com `timeZone` da plataforma — mostra horários BRT corretos independente da TZ do navegador.
- **Cache key** das queries do dashboard bumpada para `dashboard-data-v2:*` e `dashboard-drill-open-v2:*` (invalida v1 ao subir).
- **Tour do dashboard** atualizado para o novo layout: filtros (sem seletor de conta), KPIs, sem-resposta, chart, distribuições (inbox+departamento), status, recentes.

### Removido

- **Seletor de conta do dashboard** — vivia em `<DashboardFilters>`, agora é exclusividade do sidebar (`<AccountSwitcher>`). Toda a plataforma respeita o cookie `active_account` global.
- **`topTeams`** do contrato `DashboardData` — substituído por `byTeam` (com bucket "Sem departamento") + `byStatus` (4 fatias) + `noResponse`. Tipo `DashboardTopTeam` mantido por compat temporária.
- **Lista "Departamentos com mais resolvidas"** — virou bar chart clicável com semântica nova (open+pending+snoozed). Avatares com initials de teams (que mostravam "?" para nomes vazios) deixaram de existir naturalmente.
- Uso de `<DrillDownSheet>` no dashboard — migrado para `<DrillDownDialog>`. Componente `<DrillDownSheet>` segue existindo para outras telas.

### Corrigido

- **Timezone errada no chart** — formatter usava TZ do navegador. Trocado por `Intl.DateTimeFormat({ timeZone })` lendo `app_settings.platform.timezone` (default America/Sao_Paulo).
- **Taxa > 100%** (ex.: 131,6%) — coortes diferentes para numerador (resolvidas com `last_activity_at`) e denominador (recebidas com `created_at`). Agora ambas usam a mesma coorte; clamp defensivo a 100%.
- **"Abertas" (agora) = 1.475 com filtro Hoje** — era snapshot global. Agora respeita o filtro.
- **Ícones "?" em listas top-5** — surgiam no avatar de team quando `getInitials` recebia nome vazio. Substituído por gráfico (sem avatar).
- **Seletor de conta duplicado** — sidebar + dashboard. Mantido só no sidebar.

### Verificação

- `npm run typecheck` — verde nos arquivos do dashboard.
- `npm run lint` — verde nos arquivos novos/modificados do dashboard (warnings pre-existentes em outros módulos).
- `npm test` — 510 testes passam (1 test suite com SIGSEGV ambiental, não relacionada).
- `npm run build` — produção compila com sucesso, todas as 25 rotas listadas.

---

## [v0.9.0] 2026-04-30 — Conversas Poderoso

> Redesign completo da tela `/relatorios/conversas`: query builder com **E/OU** em grupos, painel de **Ordenação** em cadeia, **drill-down inline expansível**, **sticky toolbar + header**, status no feminino com cores ajustadas, filtro por **Etiquetas**, fix de bugs críticos de UX e ordenação. Spec/plan em `docs/superpowers/{specs,plans}/2026-04-30-conversas-poderoso-*.md`.

### Adicionado

- **`<FiltersDialog>` centralizado** — substitui `<FiltersDrawer>` lateral. Modo **Simples** (paridade com drawer + Etiquetas) e **Avançado** (query builder com E/OU em grupos, 10 campos: caixa, departamento, atendente, status, prioridade, etiquetas, sem resposta há, aberta há, nome, WhatsApp). Operadores `eq/neq/gt/gte/lt/lte/contains/starts_with/in/not_in/contains_all`. Apply explícito.
- **`<SortingDialog>`** — painel de ordenação em cadeia com lista ordenável (↑↓), Asc/Desc por critério, badge de índice, Adicionar/Remover, Limpar/Aplicar. Convive com click+shift+click no header (atalho rápido) que continua funcionando.
- **Drill-down inline na tabela** — chevron na primeira coluna; click em qualquer célula expande linha mostrando WhatsApp formatado, Documento, Etiquetas full, Atributos completos sem reticências (até 30, com "Ver mais (N)") e Tempos. Botão "Abrir no Chatwoot" no rodapé do detalhe. Colunas Phone/Doc/Labels/Attrs/Created/LastActivity migram para o detalhe (ainda disponíveis via `ColumnsToggle`).
- **Sticky toolbar + sticky thead** — toolbar de filtros e cabeçalho da tabela ficam fixos durante scroll; `--toolbar-h` calculado em runtime via `ResizeObserver`; z-index disciplinado (`--z-toolbar: 30`, `--z-table-thead: 20`, `--z-modal: 100`, `--z-toast: 1000`).
- **Filtro por Etiquetas** — `getLabels(accountId)` em meta-cache (Chatwoot `labels`); novo grupo "Etiquetas" no FiltersDialog com `<MultiSelectCheckbox>` buscável; serializado em URL como `label=`.
- **Tipografia +1 step** — root html bumpado de 16px → **16.25px** (≥1280px = 16.5px); promoção `text-xs`→`text-[13px]` em valores tabulares; `text-[10px]`→`text-[11px]` em labels secundárias.
- **Skip link a11y** — "Pular para a tabela de conversas" para usuários de teclado.
- **Tour estendido** — passo `drill-down` cobrindo a chevron-cell + cópia de `sorting-chip` revisada.
- **`<ConversasPageClient>`** — client wrapper que cabeia `sortStack` entre `<AdvancedFilters>` e `<ConversasTable>` (state controlado, persistido em `localStorage`).
- **`condition-group-codec.ts`** — encode/decode base64url de `ConditionGroup` na URL (param `cg`, cap 4kB).

### Mudou

- **Status no feminino**: "Em aberto" → **Aberta** (amber, mantido); "Resolvida" mudou cor de **emerald → sky** (azul claro); "Pendente" mantido (violet); "Adiado" → **Adiada** com cor **slate** (cinza claro). Atualizado em badge, dashboards (pie chart, drill-down) e KPIs ("Abertas" plural).
- **Coluna "Labels" → "Etiquetas"** em UI, `ColumnsToggle` e mobile cards (chave interna `labels` mantida por compat).
- **`FilterState`** estendido: `labelIds: number[]`, `mode: "simple" | "advanced"`, `conditionGroup?: ConditionGroup`.
- **`<ConversasTable>`** passou a receber `sortStack` / `onSortStackChange` / `conditionGroup` controlados pelo parent. `applyConditions` é executado client-side antes do sort.
- **Operadores `in`/`not_in`** em `applyConditions` agora detectam `Array.isArray(fieldValue)` e fazem lookup por `id`/`name` em arrays de objetos (necessário para filtrar por Etiquetas no modo Avançado).

### Corrigido

- **Bug ordenação null** (R6) — `nullableNumberCompare` agora trata `null` como **valor mínimo** simétrico (asc: null primeiro; desc: null último). "Tracinho" em `waiting_seconds`/`open_seconds` significa "não está esperando" e deve aparecer antes dos valores numéricos quando ordenamos pelo menor tempo. Extraído para `src/lib/utils/null-compare.ts` com testes simétricos.
- **`<CustomSelect>` intermitente** — substituído handler `mousedown` manual por `<Popover>` da base-ui. Elimina race em que o próprio click no trigger era detectado como "click outside" antes do `setOpen(true)` propagar (causava dropdown precisar de 2 clicks).
- **`<PeriodPills>` calendário** — `key` do `<PickerPanel>` estabilizada (não remonta em cada render quando o range muda durante seleção).

### Removido

- `<FiltersDrawer>` (substituído por `<FiltersDialog>`) e respectivo teste.
- `renderTrigger` prop não usada do `<CustomSelect>`.

### Verificação

- `npx tsc --noEmit` → exit 0
- `npx jest` → **503/503 testes passando**, 58 suites
- `npm run build` → production build OK, todas as rotas geradas

🤖 Implementado em modo autônomo total — Claude Opus 4.7 (1M context).

---

## [v0.8.0] 2026-04-30 — Pré-agregação de relatórios + hotfix Bad Gateway

> Release de **infraestrutura**. Resolve o incidente recorrente de Bad Gateway em produção e move parte da carga dos relatórios para um modelo de pré-agregação assíncrona, reduzindo a pressão sobre o banco do Chatwoot e habilitando atualização "quase em tempo real" via SSE.

### Hotfix Bad Gateway (urgente — incidente 2026-04-30)

- **`docker/Dockerfile`** — `--chown=nextjs:nodejs` em todos os COPY + `mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next` antes de `USER nextjs`. Causa raiz: `EACCES` ao escrever cache do Next 16 (`next/image`, prerender) virava `unhandledRejection`, matava o processo e Swarm reiniciava — Traefik respondia 502 durante o restart.
- **`prisma/seed.ts`** — passa `adapter` ao `new PrismaClient` (Prisma 7 + adapter-pg exigem); seed deixou de quebrar com `PrismaClientInitializationError`.
- **`src/instrumentation.ts`** (novo) — handlers globais de `unhandledRejection` e `uncaughtException` que apenas logam (defense-in-depth).

### Adicionado — modelo de pré-agregação

- **6 tabelas no banco interno** (Prisma migration `20260430_pre_agregacao`):
  - `chatwoot_facts_daily_by_account` — KPIs diários consolidados.
  - `chatwoot_facts_daily_by_inbox` — recortado por inbox.
  - `chatwoot_facts_daily_by_agent` — recortado por agent (orphans excluídos).
  - `chatwoot_facts_daily_by_team` — recortado por team (sentinela `0` = "sem time").
  - `chatwoot_facts_hourly_by_account` — granularidade hora × dia.
  - `chatwoot_facts_meta` — controle por dimensão (`last_refresh_at`, `last_error`, status).
- **Camada de leitura** `src/lib/chatwoot/facts.ts` — `readFactsDaily()`, `readFactsHourly()`, `readFactsMeta()` com Zod nos args, `excludeMatrixIA` via LEFT JOIN e cálculo de `lagSeconds + status` (fresh/stale/lagging/never).
- **5 jobs BullMQ** em `src/worker/jobs/pre-agregacao/`:
  - `refresh-by-account` (template).
  - `refresh-by-inbox`, `refresh-by-agent`, `refresh-by-team`.
  - `housekeeping-old-buckets` — DELETE WHERE bucket_date < hoje − retention (lê `audit.retention_days`).
- **Schedules cron repetíveis** via `queue.upsertJobScheduler` registrados ao subir o worker:
  - `refresh-by-*` a cada 5 min (`*/5 * * * *`).
  - `housekeeping-old-buckets` diário 03:00 (`0 3 * * *`).
- **Página `/configuracoes/jobs`** (super_admin only) — lista 5 dimensões × N accounts com status colorido (fresh/stale/lagging/never), lag em minutos, `last_error` truncado, botões "Rodar agora" e "Backfill 90 dias". Auto-refresh a cada 5s. Action `triggerRefresh` + `triggerBackfill` + `getJobsStatus` em `src/lib/actions/jobs.ts` (com audit log).
- **Sidebar** — link "Jobs de pré-agregação" (super_admin only) sob Configurações.

### Adicionado — UI de freshness + tempo "quase real"

- **`<FactsFreshness accountId={...} />`** — badge no header dos relatórios com cor verde/âmbar/rosa/cinza + ícone Lucide e label "Atualizado há X min". Tooltip mostra ISO da última agregação. Auto-refresh 30s. Aplicado em: Visão Geral, Distribuição, Equipe, Origem & IA, Performance, Dashboard.
- **SSE de invalidação** — `withMetaUpdate` publica `{ type: "facts:refreshed", dimension, accountId }` no canal `nexus-insights:realtime` ao concluir um job. Frontend escuta via `useFactsRealtime` (debounce 5s) e dispara `router.refresh()` automaticamente — usuário vê o painel atualizar sem reload.
- **Server Action** `getFreshnessForAccount` em `src/lib/actions/freshness.ts`.

### Mudou — relatórios migrados para facts

- **`volumetria-heatmap`** — agora lê de `chatwoot_facts_hourly_by_account` quando filtros são compatíveis (sem inbox/team/agent específicos). Caso contrário, fallback para Chatwoot direto. Cache key inalterado.
- **`volumetria-dow`** — agora lê de `chatwoot_facts_daily_by_account` e agrega DOW em JS. Mesmo padrão de fallback.

> Os outros 9 relatórios (`home-summary`, `dashboard-data`, `dashboard-kpis`, `status-distribution`, `ranking-atendentes`, `por-departamento`, `tempos-resposta`, `leads-recebidos`, `matrix-ia`) **continuam on-demand** mas exibem o badge `<FactsFreshness />` para sinalizar que existe um pipeline de pré-agregação em paralelo. Migração desses está prevista para a v0.9 (depende de extensões de schema, ex.: snapshot live de open/pending por inbox/team).

### Documentação

- **`docs/superpowers/specs/2026-04-30-pre-agregacao-design.md`** — spec v3 (com histórico v1→v2→v3 documentado).
- **`docs/superpowers/plans/2026-04-30-pre-agregacao.md`** — plan v3 com 6 marcos (M1 schema+leitura, M2 jobs, M3 backfill, M4 migração, M5 SSE+UI, M6 encerramento).

### Testes

- **+59 testes novos** (459 → 506 total + 1 falhando em arquivo untracked alheio):
  - `facts.test.ts` (13).
  - `shared.test.ts` (8 + 3 SSE).
  - `refresh-by-{account,inbox,agent,team}.test.ts` (~30).
  - `housekeeping.test.ts` (5).
  - `jobs.test.ts` (11) — Server Actions.
  - `volumetria-{heatmap,dow}.test.ts` migradas (7).
  - `facts-freshness.test.tsx` (4).
  - `use-facts-realtime.test.tsx` (5).

### Operação / Runbook

- Após deploy, super_admin abre `/configuracoes/jobs` e clica em "Backfill 90 dias" para cada dimensão (1ª vez). Tempo esperado: 5–15 min para 2 accounts × 90 dias.
- Verificar `/api/health` (sem alteração — extensão `chatwoot_facts.{by_X}` fica para v0.9).
- Logs do worker (`docker service logs nexus-insights_worker`): `[worker.refresh-by-X] done <jobId> { accounts: N, days: 7, errors: 0 }` a cada 5 min.

### Riscos conhecidos / TODO v0.9

- `triggerBackfill` enfileira `{ days }` em `job.data` mas `processRefreshByX` ainda ignora — janela rolling fixa de 7 dias permanece. (Fácil de estender; documentado em `src/lib/actions/jobs.ts` e na nota de rodapé do painel.)
- 9 relatórios ainda on-demand (lista acima).
- Snapshot live (open_at_eod, pending_at_eod) só é gravado para "hoje" — dias passados ficam zerados.
- Statement timeout do pool Chatwoot mantém os 30s históricos do app (worker não tem isolamento próprio nessa release).

---

## [v0.7.0] 2026-04-29 — Polimento UX + Agente Nex 2.0

> Polimento amplo após release v0.6.1 — atende feedback crítico do usuário sobre sidebar, filtros, conversas, tour e configuração do Agente Nex.

### Adicionado

- **`<PageShell variant="wide" | "narrow">`** — wrapper de largura por contexto. `wide` = 1600 px (relatórios), `narrow` = 1280 px (admin). Substitui o `max-w-7xl` global do layout protegido. Resolve o problema de monitor 27" ficar com sobra inutilizada.
- **`<Sheet>` + `<CollapsibleSection>` + `<MultiSelectCheckbox>` 2.0 + `<SearchableSelect>` + `<TierBadge>`** — primitivos de UI novos para drawer lateral, seções colapsáveis, multi-select com busca e Selecionar todos/visíveis, single-select com busca, e badge de consumo (FREE / $ / $$ / $$$).
- **Filtros — toolbar compacta + drawer**: substitui o cards-de-multi-select por toolbar com Período + Busca + chip "Filtros · N" que abre drawer lateral com 5 seções colapsáveis (Caixa de entrada, Departamento, Atendente, Status, Prioridade). Cada seção tem busca interna e Selecionar todos/visíveis. Chips de filtros aplicados aparecem inline com X por grupo + "Limpar tudo".
- **Tour de Conversas estendido** de 4 → 9 etapas: período, busca, filtros, ordenação (com explicação shift+click), colunas, page size, tabela, abrir no Chatwoot, refresh.
- **Tours estendidos / criados** para Visão Geral, Performance, Equipe, Distribuição, Origem & IA e Mensagens não respondidas.
- **`getInboxesForUser()`** — helper que respeita `reports.include_matrix_ia` + role. Aplicado nas páginas de Conversas e Mensagens não respondidas, escondendo a inbox 31 dos dropdowns para não-superadmins quando flag OFF.
- **Empty state com "Limpar filtros"** na tabela de Conversas quando há filtros aplicados.
- **PROVIDER_CATALOG (LLM)** — catálogo rico de modelos (abril/2026) por provider, com tier de custo (`free/low/medium/high`), URLs de API key e top-up. OpenAI: GPT-4o, 4.1, o1/o3/o4. Anthropic: Claude 3.5/4.5/4.6/4.7. Gemini: 1.5/2.0/2.5. OpenRouter: ~17 modelos cobrindo open-source free.
- **Configuração Agente Nex 2.0**:
  - Select de modelo via `<SearchableSelect>` com busca interna e badge de tier.
  - Primeira opção sempre **"Outro (digitar manualmente)"** — habilita campo livre.
  - Atalhos abaixo do API key: "Criar API key" + "Adicionar crédito" (links nativos por provider).
  - **Teste de conexão profundo**: detecta `invalid_key`, `model_not_found`, `no_credit`, `rate_limit`, `network`. Por provider: OpenAI usa `/v1/models` antes da chat; Anthropic detecta `credit_balance_too_low`; OpenRouter consulta saldo via `/credits`.
  - **Auto-save após teste OK** (com `creditOk !== false`). Save manual = test + save.

### Mudou

- **Tagline "Relatórios e insights" → "Relatórios Inteligentes"** no login e topo do sidebar.
- **Sidebar — active state**: pílula sólida sutil (`bg-violet-500/10` + violet text). Submenu ativo: dot violet à esquerda + sem pílula full. Sem mais "borda esquerda violet arredondada".
- **Sidebar — `isActive` longest-prefix-match**: corrige bug em que clicar em "Consumo IA" marcava também "Configurações" como ativo. Folhas usam exact / sub-rota; grupos usam prefix.
- **`AdvancedFilters`** completamente refatorado para toolbar+drawer (mantém prop API pública).
- **"Equipe" → "Departamento"** no filtro (mantém key interna `teamIds`).
- **Labels da tabela Conversas**: chips neutros (sem cor por hash). Todas as labels visíveis com `flex-wrap` (sem `+N` por padrão).
- **Atributos da tabela Conversas**: agora exibe chips `chave: valor` (com tooltip completo). `defaultVisible: true`.
- **Coluna "Ações"** da tabela Conversas: refator via `buildColumns(accountId)` factory; `<OpenInChatwoot>` definido direto no `render`.
- **Tour overlay**: popover mede altura real via `ResizeObserver` (sem mais estimativa fixa de 200 px que cortava botões); largura adapta-se a viewports < 480 px.
- **Cópia do toggle Matrix IA** ampliada: deixa explícito que afeta tabelas, gráficos, KPIs e dropdowns.
- **Origem & IA**: gating Matrix IA agora usa a flag canônica `reports.include_matrix_ia` (antes usava feature flag separada — desconexa do toggle).

### Corrigido

- **`MATRIX_IA_INBOX_ID = 31`** centralizado em `src/lib/constants/matrix-ia.ts` (evita magic number).

### Testes

- 6 novos componentes UI base com cobertura TDD: `Sheet` (3), `CollapsibleSection` (4), `MultiSelectCheckbox` (6), `SearchableSelect` (4), `TierBadge` (4), `PageShell` (3).
- `getInboxesForUser` (6 cenários: super_admin, manager flag ON/OFF, viewer, admin, stale).
- `isLeafActive` longest-prefix-match (12 cenários incluindo `/configuracoes/consumo`).
- `LabelsChips` neutro sem cap (4).
- Filtros: `AppliedFiltersChips` (8) + `FiltersDrawer` (8).
- LLM 2.0: `PROVIDER_CATALOG` shape; `deepTest` por provider mocking `fetch`.

### Quebras / migrações

- O `MultiSelectFilter` interno de `mensagens-nao-respondidas-filters.tsx` foi substituído pelo `<MultiSelectCheckbox>` 2.0 (drop-in compatível).
- Páginas em `src/app/(protected)/*` agora envolvem o conteúdo em `<PageShell>` (não havia `max-w-*` direto no `page.tsx` antes — era do layout). Sem impacto funcional.

---

## [v0.6.1] 2026-04-29 — Tabela Conversas parruda + Busca global + Tour + Toggle Nex/Matrix IA

### Corrigido (crítico)
- **Erro 500 em `/relatorios/performance`, `/equipe`, `/distribuicao`, `/visao-geral`, `/origem-ia`**: Server Components passavam funções (`render`, `formatValue`) diretamente para Client Components — proibido em React 19/Next 16. Criados 4 client wrappers (tempos-resposta-bar, sla-policies-table, ranking-atendentes-table, por-estado-table) e 10 contents foram envolvidos em try/catch com `<ErrorState>` em vez de propagar exception.
- **Bug `column t.color does not exist` em /relatorios/conversas**: schema da tabela `tags` do Chatwoot tem só id/name/taggings_count. Removida referência a `t.color`. `<LabelsChips>` agora gera cor determinística via hash do nome.
- **BadgeSelect dropdown não abria** (status na tabela /usuarios + nível no dialog Editar): classes `scale-95 opacity-0 fill-mode-forwards` deixavam o popover invisível para sempre. Removidas. Z-index elevado para 1000.

### Adicionado
- **Wizard 3 etapas no Novo/Editar Usuário** voltou: Identidade → Acesso (condicional por nível) → Confirmação. Super_admin pula etapa Acesso (banner "Acesso total"); admin/viewer com multi-select de contas; gerente com contas + departamentos. Stepper visual no topo.
- **Dropdown Nível de acesso** virou combobox vertical (não pill) com ícone + label semibold + descrição + check, via portal/fixed pra não ser cortado pelo dialog.
- **Owner immutability total**: owner não pode ser editado/deletado por NINGUÉM (incluindo si mesmo via /usuarios — edita-se via /perfil). Super_admin pode editar/deletar OUTROS super_admin não-owner. 28 testes em `permissions.ts`.
- **Busca global Cmd/Ctrl+K** na sidebar:
  - Barrinha no topo da sidebar (substitui o conteúdo onde estava o account switcher)
  - Modal full-screen com portal + backdrop blur
  - Busca em Empresas (contas Chatwoot) + Usuários (super_admin/admin) + Páginas
  - Setas ↑↓ navegam, Enter abre, ESC fecha
  - Resultados agrupados com contadores
  - Atalho Cmd+K (Mac) / Ctrl+K (outros) detectado automaticamente
- **Account Switcher movido pro fundo da sidebar** (acima do user info).
- **Pill "Todos"** nos filtros de período: cobre desde o epoch (1970-01-01) até agora — pega TUDO do banco.
- **Custom range ILIMITADO**: removido cap de 90 dias. `mín = primeiro registro do banco` (busca via `getMinReportDate(accountId)`); `máx = hoje`.
- **`<RefreshButton>`** ícone giratório em todas as pages de relatório (router.refresh + useTransition).
- **`<LoadingOverlay>`** durante filter transitions com spinner + texto "Carregando relatório...". Provider compartilhado `<FilterTransitionProvider>` envolve `AdvancedFilters` + `PeriodSelectorUrl` + filters.
- **Toggle Matrix IA** em /configuracoes (super_admin only): Switch ON/OFF na key `reports.include_matrix_ia`. OFF: esconde inbox 31 dos não-super_admin. Super_admin sempre vê tudo. Helper `shouldExcludeMatrixIA()` aplicado em todas queries.
- **Tabela Conversas parruda** (refatoração 100%):
  - 16 colunas configuráveis: #, Nome, WhatsApp, **Documento** (CPF/CNPJ via detectDocument), Estado, Departamento, Atendente, Status, Prioridade, Labels, **Sem resposta há**, **Aberta há**, **Criado em**, **Última atualização**, atributos custom, Ações.
  - **Sort clicável** com cycle `null → asc → desc → null`, indicador `ChevronUp/Down`.
  - **Multi-sort hierárquico** via Shift+click (badge numerado 1, 2, 3 nos headers).
  - **Esconder colunas**: botão "Colunas" abre popover com checkboxes (persistido em localStorage chave `conversas-table-cols`). Padrão: todas selecionadas. Atalhos "Selecionar todas" / "Desmarcar todas".
  - **Selector de quantidade**: 50 / 100 / Todos (max 10000) — persistido em localStorage.
  - **Tempo sem resposta**: status=1 → "—". Aberta + última msg incoming → `now - last_incoming_at`. Caso contrário → "—".
  - **Tempo aberta**: status=1 → "—". Aberta + última msg outgoing → `now - last_outgoing_at`. Caso contrário → "—".
  - Cálculo via `EXTRACT(EPOCH FROM ...)` no Postgres com `CASE` por status.
  - Mobile vira cards com mesmas informações.
- **Tour/Tutorial passo-a-passo** com botão "?" no header dos relatórios:
  - `<TourProvider>` context montado no protected layout
  - `<TourOverlay>` com SVG-mask spotlight no target + halo violeta + popover adaptivo
  - Backdrop blur, animações Framer Motion respeitando `prefers-reduced-motion`
  - Tours definidos: dashboard, conversas, mensagens-não-respondidas
  - Esc fecha, setas navegam, "Pular tour" disponível
- **Toggle ON/OFF do Agente Nex bubble** em /configuracoes:
  - Bloco "Status do agente" no topo do `<LlmConfigCard>` com Switch + dot esmeralda glow (ON) / cinza (OFF)
  - Setting `nex.bubble_enabled` em `app_settings`. Default: ON quando há LLM config ativa, OFF caso contrário.
  - Layout protegido renderiza `<NexBubble />` condicionalmente.
  - Switch desabilitado quando não há config LLM (com tooltip).

### Mudanças de comportamento
- `PeriodKey` agora tem 5 valores canônicos: `hoje | semana_atual | mes_atual | todos | custom`.
- Custom range não é mais 90 dias máx — é todo o histórico do banco.
- Conversas table state (sort/cols/page-size) persistido por usuário em localStorage.

### Tests
- 279 testes Jest passando (241 → 279 desde v0.6.0).

---

## [v0.6.0] 2026-04-29 — Refazer fiel ao Roteador + Agente Nex IA + relatórios consolidados

### Corrigido
- **Filtros que aplicavam automaticamente** virou filtros com botão "Aplicar" via novo `<AdvancedFilters>` (estado interno draft vs URL applied).
- **Cap artificial de 90 dias** no custom range removido — agora cobre desde a primeira linha do banco.
- **Loading state ausente** virou skeleton screens em todas as pages (TableSkeleton, CardSkeleton, ChartSkeleton, ProfileCardsSkeleton).
- **Dashboard sem gráficos** virou /dashboard com line chart Recharts (Recebidas + Resolvidas) + 4 KPIs clicáveis com sparkline + Top 5 cards + Recent Conversations table + drill-down sheets.
- **/perfil divergente do Roteador** refeito fielmente (4 cards stack vertical: Informações Pessoais com avatar+Membro desde / E-mail / Senha / Aparência 3 toggles).
- **/usuarios divergente** refeito fielmente (BadgeSelect inline pra Nível/Status, modal único Criar/Editar — sem wizard de 3 passos, lápis + lixeira nas Ações, owner imutável).

### Adicionado
- **`<BadgeSelect>`** componente reutilizável (dropdown com badges coloridos + ícones) — usado em /usuarios pra Nível/Status inline.
- **`<AdvancedFilters>`** filtros multi-campo com botão Aplicar (não auto-apply), estado draft vs URL applied, indicador "X filtros pendentes", multi-select por inbox/team/atendente/status/prioridade.
- **`<SortableTable>`** + **`<GroupableTable>`** + **`useSortableData`** hook — ordenação clicável por coluna (asc/desc/null cycle) + agrupamento + a11y (aria-sort).
- **`<ConditionalFilters>`** Where-clause builder (AND/OR + 10 operadores eq/neq/gt/lt/contains/in/etc., grupos aninhados) + `applyConditions()` puro.
- **Charts library** (`src/components/charts/`): InteractivePieChart, DonutWithCenter, InteractiveBarChart, InteractiveAreaChart, InteractiveRadialBarChart, ChartTooltip, EmptyChartState — todos com animação 800ms, hover dim, tooltip rico, prefers-reduced-motion respeitado.
- **`<ErrorState>`** + **`<ErrorStateRetry>`** + skeleton variants (TableSkeleton, CardSkeleton, ChartSkeleton, ProfileCardsSkeleton).
- **Dashboard drill-down**: clique em qualquer KPI abre `<DrillDownSheet>` lateral com gráficos detalhados (LineChart + BarChart + AreaChart + tabela) e queries específicas por KPI.
- **5 super-relatórios** consolidando os 12 antigos:
  - `/relatorios/visao-geral` (Status pie + Volumetria)
  - `/relatorios/performance` (Tempos resposta + SLA + CSAT)
  - `/relatorios/equipe` (Ranking + Por departamento)
  - `/relatorios/distribuicao` (Por estado + Horário)
  - `/relatorios/origem-ia` (Leads + Matrix IA)
- **Standalone**: `/relatorios/conversas`, `/relatorios/mensagens-nao-respondidas`.
- **Redirects 302** das 10 rotas antigas (status-conversas, sla, tempos-resposta, ranking-atendentes, por-departamento, por-estado, volumetria, leads-recebidos, matrix-ia, csat) para os super-relatórios.
- **Catálogo de relatórios** + **toggle ON/OFF** em /configuracoes (super_admin) — sidebar respeita imediatamente após salvar (revalidatePath).
- **Footer "Nexus AI © 2026. Todos os direitos reservados"** fixo no rodapé da sidebar.

### Agente Nex (IA com query no DB Chatwoot)
- **Bubble flutuante** `<NexBubble>` bottom-right em todas pages protegidas — gradient violet com glow pulsante, indicador online, respeita prefers-reduced-motion.
- **Chat panel** `<NexChatPanel>` (sheet bottom-right desktop / fullscreen mobile) com markdown rendering, persistência localStorage (40 msgs cap), sugestões iniciais, textarea auto-grow, Enter envia / Shift+Enter quebra.
- **7 tools (function calling):** `query_conversations`, `query_messages`, `query_users`, `query_contacts`, `aggregate_conversations`, `get_top_agents`, `get_dashboard_summary`.
- **Multi-provider LLM:**
  - Adapters via `fetch` puro pra OpenAI / Anthropic / Gemini / OpenRouter — interface comum `ProviderClient.chat({messages, tools})`.
  - Mock automático quando API key vazia/MOCK (permite UI testável sem key real).
  - Pricing por modelo (gpt-4o, claude-3-5-sonnet, gemini-2.0-flash, etc.).
- **UI config** em /configuracoes (super_admin): card "Agente IA (Nex)" com select de provider + modelo + API key (encrypted AES-256-GCM no DB) + botão "Testar conexão" + status badge.
- **Dashboard de consumo** `/configuracoes/consumo` (super_admin): KPIs (chamadas/tokens/custo), gráficos (custo por dia, distribuição por provider, custo por modelo), tabela paginada, filtros sem cap superior (mín = data de criação do sistema), pill "Tudo" cobre desde o início.
- Tabelas DB novas: `llm_configs` + `llm_usage` (criadas via `CREATE TABLE IF NOT EXISTS` idempotente).
- Logging automático de cada chamada do agente em `llm_usage`.

### Mudanças de comportamento
- `PeriodKey` canônico: 4 valores (`hoje | semana_atual | mes_atual | custom`). Fallback síncrono em `getPeriod` pra chaves legadas (ontem/7d/30d/mes_anterior) ainda funciona via Date local.
- Filtros condicionais: novo padrão Where-clause builder disponível mas ainda não aplicado em pages (uso futuro).
- Charts dos relatórios devem usar componentes de `src/components/charts/*` (B6) — Recharts direto agora é exceção.

### Removido
- 10 pages antigas de relatórios (substituídas por redirects 302 para os super-relatórios).
- `kpi-clickable.tsx`, `top5-card.tsx` (substituídos por StatsCard / KpiClickableCard / Top5ListCard).
- `edit-user-dialog.tsx`, `users-table.tsx`, `role-badge.tsx` (consolidados em `users-content.tsx` + `user-form-dialog.tsx`).
- `conversas-filters.tsx`, `period-selector.tsx` (substituídos por `AdvancedFilters` + `PeriodPills`).

### Tests
- 241 testes Jest passando (95 → 241 desde v0.5.0).
- Cobertura: helpers (datetime, filter-state, format-document, generate-temp-password, apply-conditions, calculateCost, charts colors), hooks (useSortableData), tools (Nex definitions + run-nex), providers (mock factory + interface), queries (usage-stats, catalog).

### Stack atualizado
- Recharts 3 (charts)
- Framer Motion 12 (animações)
- date-fns + date-fns-tz (datas com TZ)
- base-ui (Popover, Dialog, Sheet, Tabs)
- Lucide (icons)

---

## [v0.5.0] 2026-04-29 — Foundation + UX shell + dashboards operacionais

### Crítico (corrigido)
- **Login quebrado** (`?error=Configuration`): pg-node SCRAM falhava ao resolver `db` (DNS overlay Swarm devolvia 2 IPs, um stale). Corrigido em duas frentes: (1) `pg_hba.conf` do db container alterado pra `trust` no overlay interno; (2) `DATABASE_URL` aponta agora pra `nexus-insights_db:5432` (FQDN do serviço Swarm) em vez de `db:5432`.
- **Owner trancado pós regen-senha:** botão regen-senha **escondido** (não disabled) pra `isOwner`. Idem botão delete e dropdown de status.
- **Auth bypass Prisma:** `authorizeCredentials` e `logAudit` agora usam `pgPool` raw (`@/lib/pg-pool`) — adapter do Prisma 7 + SCRAM tava dando `AuthenticationFailed` esporádico.

### Adicionado
- **Helpers datetime** (`src/lib/datetime.ts` + `src/lib/datetime-core.ts`): `getPlatformTz()`, `getPlatformLocale()`, `getPeriodInTz()`, etc. Cache 60s, fallback `America/Sao_Paulo` / `pt-BR`. Server action `updatePlatformSettings` (super_admin) com invalidação de cache reports.
- **`platform.timezone` e `platform.locale` em AppSetting**: chaves novas, lazy default (sem migration). UI em `/configuracoes` (super_admin).
- **Senha temporária simples** (`generateTempPassword`): 8 chars alfanuméricos, sem confundíveis (`0`, `1`, `i`, `l`, `o`, `I`, `L`, `O`).
- **/perfil 4 cards** no padrão Roteador Webhook Meta: Informações Pessoais, E-mail, Senha, Aparência (3 toggles grandes Escuro/Claro/Sistema). Layout 2x2 desktop, stack mobile.
- **/usuarios redesign:** Switch de status virou Select dropdown; coluna Ações com lápis editar (EditUserDialog 3 tabs); regen + delete escondidos pra owner; NewUserDialog vira wizard 3 passos com preview da senha temp gerada.
- **Filtros pills mobile-friendly:** 4 períodos (Hoje / Esta semana / Este mês / Personalizado) com `overflow-x-auto snap-x` no mobile, Popover com calendário no desktop, Sheet bottom no mobile. Range custom max 90 dias.
- **Account switcher condicional:** escondido quando user só tem ≤1 conta.
- **TZ Brasil em todos os relatórios:** helper `resolvePeriod(searchParams)` em `src/lib/reports/resolve-period.ts`.
- **Dashboard novo:** 4 KPIs clicáveis (Em Aberto, Pendentes, Resolvidas no período, Mensagens não respondidas) + 3 cards Top 5 (atendentes mais rápidos, mais conversas em aberto, inboxes mais carregados).
- **Mensagens não respondidas (nova tela):** `/relatorios/mensagens-nao-respondidas`. Lista conversas open com última msg incoming. KPIs no topo (Total / Tempo médio / Mais antigo). Mobile cards.
- **Conversas redesign:** 11 colunas (Nome | WhatsApp | Documento | Estado | Departamento | Atendente | Status | Prioridade | Labels | Ações). Removida "Última mensagem". Documento detectado via `identifier` → `additional_attributes.cpf|cnpj` → regex. Labels via `json_agg` com cor de fundo + contraste por luminância. Mobile vira cards.
- **Sidebar reorganizado** com seções (Dashboard / Relatórios / Administração) + item "Mensagens não respondidas".
- **Middleware** com `REDIRECT_MAP` pronto pra ativar consolidação 11→4 (futuro v0.5.1).
- **30+ testes Jest novos:** total 114 testes passando.

### Mudanças de comportamento
- `PeriodKey` reduzido pra 4 valores canônicos (`hoje | semana_atual | mes_atual | custom`). Chaves legadas (`ontem | 7d | 30d | mes_anterior`) ainda funcionam via fallback síncrono.
- Build target: client bundle não puxa mais `pg`/`pg-pool` graças ao split `datetime-core` (puro) vs `datetime` (server-only).

### Pendente (próximo release v0.5.1)
- Consolidar os 11 relatórios em 4 dashboards (`/relatorios/operacao`, `/relatorios/atendentes`, `/relatorios/distribuicao`, `/relatorios/origem-resultado`) com Tabs internas + redirects 302. `REDIRECT_MAP` em `src/middleware.ts` já está com a estrutura pronta.

---

## [PR-B] 2026-04-14 — Pipeline ingest via @nexusai360/webhook-routing

### Adicionado
- `PrismaWebhookAdapter` (`src/lib/webhook/adapter.ts`) implementando `WebhookAdapter` do pacote — mapeia tipos Prisma ↔ records do pacote, captura P2002 retornando inbound existente.
- `instrumentation.ts` (raiz) configura adapter no boot do Next runtime (Node.js).
- `src/worker/index.ts` chama `configureWebhookRouting(webhookAdapter)` no startup.
- Helper `src/lib/webhook/enqueue.ts` — preserva `InboundWebhook.processingStatus = "queued"` com BullMQ jobId determinístico.
- Migration `prisma/migrations/20260414000000_inbound_unique_dedupe/migration.sql` com `UNIQUE(companyId, dedupeKey)` — **criada, não aplicada** (operador roda `prisma migrate deploy` em ambiente conectado; cleanup de duplicatas documentado no `.sql`).
- Flag `USE_PACKAGE_PIPELINE` (default off) — opt-in para o novo pipeline no handler POST.
- `src/app/api/webhook/[webhookKey]/route-inline.ts` mantém pipeline antigo como fallback (deletado em PR-C ~7d após estável).
- Helpers legacy congelados em `src/lib/webhook/legacy/{normalizer-legacy,deduplicator-legacy}.ts` (+ testes movidos para `legacy/__tests__/`).
- Helper de testes `src/__tests__/utils/fake-adapter.ts` (adapter in-memory).
- Testes novos: `adapter.test.ts` (7 cases), `webhook-ingest.test.ts` reescrito (8 cases pipeline novo + flag off), `normalizer.test.ts` reescrito para o novo NormalizedEvent (7 cases).
- Script `scripts/smoke-webhook.mjs` — tráfego sintético HMAC-assinado a cada 30s.
- Runbook `docs/runbooks/webhook-routing-cutover.md`.
- Dev dep: `jest-mock-extended@^4.0.0` (Jest 30 compat).

### Mudanças de comportamento
- `listRoutes` é chamado UMA vez por callback (antes: por evento). Rotas criadas durante processamento de callback multi-evento não recebem deliveries para eventos posteriores no mesmo callback. Diferença teórica — callbacks Meta típicos têm 1–3 eventos.
- Dedupe de `errors.*` (eventos sem ID natural) recomeça do zero pós-deploy: `hashPayloadDeterministic` recursivo do pacote difere do `hashContent` top-level antigo. Aceitável: errors são raros, downstream apenas enfileira HTTP delivery.
- `messages.*` / `statuses.*` / `calls.*` mantêm chave de dedupe **byte-idêntica** (verificado spec I1).
- `normalizer.ts` mudou assinatura: agora recebe `(payload, companyId)` (2º arg é fallback de sourceId). Consumidores legacy continuam via `legacy/normalizer-legacy.ts`.

### Cutover
1. Merge com flag default OFF — produção segue inline.
2. `USE_PACKAGE_PIPELINE=true` em staging por 24h com tráfego sintético (`scripts/smoke-webhook.mjs`).
3. Flip em produção, monitorar 24h (runbook).
4. PR-C deleta `route-inline.ts`, flag, helpers legacy após 7d estáveis.

## [PR-A] 2026-04-14 — Helpers via @nexusai360/webhook-routing@0.2.1

### Adicionado
- Dependência `@nexusai360/webhook-routing@0.2.1` via vendor tarball + verify SHA256.
- Peer deps (tambem via vendor tarball): `@nexusai360/types@0.2.0`, `@nexusai360/core@0.2.1`, `@nexusai360/multi-tenant@0.2.1`.
- Script `scripts/verify-vendor.mjs` + `preinstall` hook validando checksums dos tarballs.
- Config Jest: `moduleNameMapper` resolvendo o pacote e subpaths para `dist/*.cjs`.

### Mudanças de comportamento (SSRF — bloqueios novos no egress de webhooks)
- **CGNAT (100.64.0.0/10)** agora bloqueado. Rotas configuradas para esse range passam a falhar.
- **IPv4-mapped IPv6** (`::ffff:a.b.c.d` decimal e `::ffff:hhhh:hhhh` hex) bloqueado quando mapeia para IPv4 privado.
- **Hostnames extras bloqueados:** `localhost.localdomain`, `ip6-localhost`, `ip6-loopback`, `broadcasthost`.

### Mudanças cosméticas
- Mensagens de erro SSRF agora são códigos estruturados (`private_ipv4`, `non_https_protocol`, `blocked_hostname`, etc.) em vez de strings em português.

### Sem mudanças
- Pipeline de ingest, normalizer, deduplicator, schema Prisma, worker — intactos. Vão ser migrados em PR-B.
