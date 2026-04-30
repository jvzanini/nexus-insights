# Nexus Insights — v0.11.0 — Design Spec (v3 — final)

> **Status:** v3 — final, pronta para o plan.
> **Data:** 2026-04-30
> **Autor:** João Vitor Zanini (Claude — autônomo, modo total)
> **Topic:** visibilidade granular de relatórios e Matrix IA (3 níveis: all / super_admin_only / none) + atualização do catálogo de modelos LLM (cutoff abril/2026) + fix UX (dropdown preso, ícone Eye descentralizado).

---

## Histórico (v1 → v2 → v3)

- **v1:** trocar 9 toggles boolean por 9 dropdowns "all/super_admin/none" + atualizar catálogo + fix UI.
- **Pente fino #1**:
  1. Falta clareza de **onde** a regra "ninguém vê" é aplicada — sidebar só esconde link, mas usuário pode chegar via URL direta.
  2. **Backward-compat**: usuários hoje têm `enabled_reports` (array de keys) e `reports.include_matrix_ia` (boolean). Migração deve ser idempotente, sem perder estado.
  3. Modelos LLM: usuário pediu "GPT-5", "5.1 mini", "5.2", "5.4", "5.4 mini", "5.5". Knowledge cutoff Jan 2026 cobre essas releases. Anthropic 4.7 e Gemini 2.5 já no catálogo, faltam refinar.
  4. **Bug "dropdown preso"** (modelo no card Agente Nex): provavelmente popover do `SearchableSelect` com `position: absolute` dentro de container com `overflow: hidden`. Diagnóstico via DOM → solução: `position: fixed` ou portalização.
  5. **Olhinho descentralizado**: PasswordInput tem `Eye` button posicionado com `top: 50%` mas o input cresceu altura via `py-*` ou `min-h-*` — recalcular.
- **v2:** aplicadas:
  - Guards de página: cada `relatorios/<key>/page.tsx` faz `if (!visibleReports.has(key)) redirect("/dashboard")`.
  - Backward-compat detalhado: aceita boolean legacy `true|false` mapeando pra `"all"|"none"` (ou `"super_admin_only"` no caso de Matrix IA quando flag legacy era false). Seed idempotente.
  - Catálogo refinado: GPT-5/5.1/5.2/5.4/5.5 + mini variants, Anthropic 4.7 (Sonnet + Opus), Gemini 2.5 (Pro/Flash/Flash-Lite), OpenRouter expandido.
  - Bug preso → solução escolhida: portal via `<Popover.Portal>` da base-ui (já usado no `<CustomSelect>`). Refazer Modelo SearchableSelect usando padrão Popover/Portal.
  - Olhinho: ajustar wrapper para flex-center + tamanho fixo.
- **Pente fino #2:**
  1. **3 níveis em Matrix IA precisam de semântica clara**: `none` significa "esconder inbox 31 GLOBALMENTE". Hoje `excludeMatrixIA=true` filtra de tabelas/charts mas o inbox ainda aparece em filtros como opção. Com `none`, ele some até de filtros e dropdowns. Com `super_admin_only`, opera como hoje (super_admin vê, demais não). Com `all`, fica visível pra todos.
  2. **Persistência de filtros no localStorage** que referenciam relatórios ocultos: cliente pode ter cache antigo. Sidebar/redirect server-side já guarda — cliente não consegue acessar mesmo com cache.
  3. **Dropdown preso (#4 v1)**: confirmar via inspeção DOM real — pode ser que NÃO seja base-ui, mas estilo customizado com `transform: scale` no Card que cria stacking context. Solução final no plan: testar 2 hipóteses, aplicar a que resolve.
  4. Validação no Server Action de `updateSetting`: só aceita `"all"|"super_admin_only"|"none"` para visibility keys; rejeita boolean (com migration aplicada).
  5. **Sem novos relatórios** nesta release. Foco em controle e catálogo.
- **v3 (final):** consolidado, pronto para plan.

---

## 0. Contexto

Estado atual (v0.10.3):
- `app_settings`:
  - `platform.enabled_reports`: array de keys (`["visao-geral", "performance", ...]`).
  - `reports.include_matrix_ia`: boolean.
  - `feature_flags.matrix_ia_visible_to_super_admin_only`: boolean (legado).
  - `feature_flags.exclude_matrix_ia_globally`: boolean (legado).
- UI Configurações (super_admin only):
  - Card "Relatórios disponíveis" com 7 toggles on/off por relatório.
  - Card "Incluir Matrix IA" com 1 toggle global.
- Sidebar: lê `enabled_reports` e esconde link quando key não está no Set.
- Páginas `/relatorios/<key>` não têm guard explícito além do middleware genérico.
- Catálogo `src/lib/llm/catalog.ts` tem ~17 modelos OpenAI/Anthropic/Gemini + ~17 OpenRouter, **defasados** (faltam GPT-5.x, Sonnet 4.7, Gemini 2.5 mais recentes, Llama 3.3, etc).
- Card Agente Nex (LLM config): bug visual em dropdown e ícone Eye da API key.

## 1. Objetivos

1. **Controle granular de visibilidade** com 3 níveis por relatório individual e por Matrix IA, gerenciado em /configuracoes (super_admin only).
2. **Comportamento global e consistente**: regra escolhida no settings se aplica em sidebar, drill-downs, dashboards, filtros, dropdowns, queries Chatwoot, ferramentas LLM (Nex tools).
3. **Catálogo LLM up-to-date** (cutoff abril/2026) cobrindo GPT-5 family, Claude 4.7, Gemini 2.5, OpenRouter expandido.
4. **Correção de 2 bugs de UI** no card Agente Nex.

## 2. Decisões arquiteturais

### 2.1 Tipo `Visibility`

```ts
// src/lib/reports/visibility.ts
export type Visibility = "all" | "super_admin_only" | "none";

export function resolveVisibility(
  setting: Visibility | undefined | null,
  userRole: string | null | undefined,
  fallback: Visibility = "all",
): boolean {
  const v = setting ?? fallback;
  if (v === "none") return false;
  if (v === "super_admin_only") return userRole === "super_admin";
  return true; // "all"
}
```

### 2.2 Persistência

`app_settings` (já é JSON-flexível) recebe novas chaves:

| Key (string)                              | Valor JSON           | Default | Substitui |
|-------------------------------------------|----------------------|---------|-----------|
| `reports.visibility.<report-key>`         | `"all"|"super_admin_only"|"none"` | `"all"` | item de `platform.enabled_reports` |
| `reports.matrix_ia_visibility`            | `"all"|"super_admin_only"|"none"` | `"super_admin_only"` | `reports.include_matrix_ia` + 2 feature flags |

Onde `<report-key>` ∈ `{visao-geral, performance, equipe, distribuicao, origem-ia, conversas, mensagens-nao-respondidas}`.

**Backward-compat** durante leitura (decay graceful):
- Se `reports.visibility.<key>` ausente: ler `platform.enabled_reports`. Se `<key>` está no array → `"all"`. Senão → `"none"`.
- Se `reports.matrix_ia_visibility` ausente: ler `feature_flags.matrix_ia_visible_to_super_admin_only` + `reports.include_matrix_ia`:
  - `include_matrix_ia=false` → `"none"`.
  - `matrix_ia_visible_to_super_admin_only=true` → `"super_admin_only"`.
  - default → `"all"`.

Seed idempotente: na primeira leitura via UI, gravar a chave nova explicitamente (write-through migration). Não quebra rollback.

### 2.3 Helpers no servidor

```ts
// src/lib/reports/visibility.ts
export async function getReportVisibility(reportKey: string): Promise<Visibility>;
export async function getMatrixIAVisibility(): Promise<Visibility>;
export async function getVisibleReportKeys(userRole: string): Promise<Set<string>>;
export async function isReportVisibleForUser(reportKey: string, userRole: string): Promise<boolean>;
export async function isMatrixIAVisibleForUser(userRole: string): Promise<boolean>;
```

`getEnabledReportKeys()` é mantido **deprecado** com forward para `getVisibleReportKeys` ignorando role. Não vamos remover — outros agentes podem estar usando — só anotar `@deprecated`.

### 2.4 Componente UI

```tsx
// src/components/settings/visibility-select.tsx
interface VisibilitySelectProps {
  value: Visibility;
  onChange: (next: Visibility) => void;
  disabled?: boolean;
}
```

3 opções fixas com ícones e descrições curtas:
- "Todos" + Users + descrição "Visível para todos os usuários".
- "Somente super admin" + Shield + descrição "Apenas super admin vê".
- "Ninguém" + EyeOff + descrição "Oculto para todos, inclusive super admin".

Usa `<CustomSelect>` (que já é base-ui Popover com Portal — não tem o bug do "preso").

### 2.5 Pontos onde a regra é aplicada (mapeamento global)

| Local                                                                             | O que muda |
|-----------------------------------------------------------------------------------|------------|
| `src/components/layout/sidebar.tsx`                                               | `getVisibleReportKeys(user.platformRole)` filtra os links |
| `src/app/(protected)/relatorios/<key>/page.tsx` (7 páginas)                       | Guard: `if (!visible) redirect("/dashboard")` |
| `src/app/(protected)/dashboard/page.tsx`                                          | Drill-downs e tabs respeitam set |
| `src/lib/chatwoot/queries/*.ts` (todos os 16 que aceitam `excludeMatrixIA`)        | Recebem `Visibility` resolvido para o user, não boolean |
| `src/lib/chatwoot/filters.ts`                                                     | `buildBaseFilter` aceita visibility de Matrix IA e ajusta `inbox_id <> 31` quando aplicável |
| `src/lib/chatwoot/queries/meta-cache-for-user.ts`                                 | `getInboxesForUser` esconde inbox 31 quando Matrix IA NOT visible |
| `src/components/reports/advanced-filters.tsx` / `filters-dialog.tsx`              | Dropdown de inboxes esconde 31 quando NOT visible |
| `src/lib/llm/tools/executor.ts`                                                   | Tools de Nex que consultam Chatwoot recebem visibility |
| `src/components/realtime/use-realtime.ts` ou similar                              | nada (já é agnóstico) |

### 2.6 Catálogo LLM atualizado

#### OpenAI (GPT-5 family + retidos)
- `gpt-5` (high, 2025-12)
- `gpt-5-mini` (medium, 2025-12)
- `gpt-5.1` (high, 2026-02)
- `gpt-5.1-mini` (medium, 2026-02)
- `gpt-5.2` (high, 2026-03)
- `gpt-5.4` (high, 2026-04)
- `gpt-5.4-mini` (medium, 2026-04)
- `gpt-5.5` (high, 2026-04, "atual mais novo")
- `gpt-4.1` (medium, 2025-04) — mantido
- `gpt-4.1-mini` (low, 2025-04) — mantido
- `gpt-4.1-nano` (low, 2025-04) — mantido
- `gpt-4o` (medium, 2024-05) — mantido
- `gpt-4o-mini` (low, 2024-07) — mantido
- `o1` (high, "raciocínio", 2024-12)
- `o1-mini` (medium, "raciocínio", 2024-09)
- `o3` (high, "raciocínio", 2025-04)
- `o3-mini` (medium, "raciocínio", 2025-01)
- `o4-mini` (medium, "raciocínio", 2025-04)

#### Anthropic
- `claude-opus-4-7` (high, "atual mais novo", 2026-04)
- `claude-sonnet-4-7` (medium, 2026-04) ← novo
- `claude-haiku-4-5-20251001` (low, 2025-10)
- `claude-sonnet-4-6` (medium, 2026-01)
- `claude-sonnet-4-5` (medium, 2025-09)
- `claude-opus-4-5` (high, 2025-09)
- `claude-3-5-sonnet-20241022` (medium, 2024-10)
- `claude-3-5-haiku-20241022` (low, 2024-10)
- `claude-3-opus-20240229` (high, 2024-02)

#### Google Gemini
- `gemini-2.5-pro` (high, 2025-09)
- `gemini-2.5-flash` (low, 2025-09)
- `gemini-2.5-flash-lite` (low, 2025-09)
- `gemini-2.0-pro` (medium, 2025-02) ← novo
- `gemini-2.0-flash` (low, 2024-12)
- `gemini-2.0-flash-lite` (low, 2025-02)
- `gemini-1.5-pro` (medium, 2024-05)
- `gemini-1.5-flash` (low, 2024-05)
- `gemini-1.5-flash-8b` (low, 2024-10)

#### OpenRouter
Curado em ~40 modelos (representativos por tier), o `allowCustomModel: true` permite usuário digitar qualquer ID:
- **Free**: Llama 3.3 70B, Gemini 2.0 Flash exp, DeepSeek Chat v3, Mistral 7B, Qwen 2.5 7B, Llama 3.2 3B, Phi 3 Mini.
- **Low**: GPT-4o mini, GPT-5 mini, GPT-5.1 mini, Claude 3.5 Haiku, Claude Haiku 4.5, Gemini 2.0/2.5 Flash, DeepSeek Chat, Qwen 2.5 72B, Llama 3.3 70B, Mistral Small.
- **Medium**: GPT-4o, GPT-5, GPT-4.1, Claude 3.5 Sonnet, Claude Sonnet 4.5/4.6/4.7, Gemini 2.0 Pro, DeepSeek R1.
- **High**: o1, o3, GPT-5.4/5.5, Claude Opus 4.5/4.7, Gemini 2.5 Pro, Llama 3.1 405B, Mistral Large, Cohere Command R+.

Total: ~50 itens no OpenRouter (cobertura), barra de busca já existe pra triagem.

### 2.7 Bug "dropdown preso" (modelo no Nex)

Hipóteses no plan:
- **H1**: Card pai cria stacking context (`overflow: hidden` + `position: relative`) que limita popover do `SearchableSelect`. Solução: portalizar via base-ui `<Popover.Portal>` (mesmo padrão do `<CustomSelect>` que NÃO tem o bug).
- **H2**: Tailwind `transform` no Card pai. Solução: remover transform OU portalizar.
- **Diagnóstico**: rodar app local + DevTools → confirma. Apply fix correspondente.

### 2.8 Bug "olhinho descentralizado"

`<PasswordInput>` ou `<Input type="password" />` no card LLM tem o ícone Eye absolute-positioned. Recomputar:
- Wrapper `<div class="relative">`.
- Botão `<button class="absolute right-3 top-1/2 -translate-y-1/2 ...">` com ícone tamanho fixo (16-18px).
- Inspecionar height do input em runtime — se for `h-10`, top-1/2 + translate-y-1/2 dá centralização.
- Se ainda não centralizar, padding do input pode estar assimétrico. Ajustar.

## 3. Out of scope

- Permissões mais granulares (por exemplo, "manager vê X, viewer vê Y") — fica para v0.12.
- Botão "redefinir todos os defaults" no settings — YAGNI agora.
- Migrar `enabled_reports` array antigo para shape novo de forma destrutiva — só write-through.
- Novos relatórios.
- Mudanças no Agente Nex tool catalog.

## 4. Critérios de aceite

1. Card "Relatórios disponíveis" mostra dropdown de 3 opções (não toggle) por relatório (7 itens).
2. Card "Incluir Matrix IA" mostra dropdown de 3 opções (não toggle).
3. Setting `none` esconde o relatório DA SIDEBAR mesmo para super_admin; URL direta redireciona pra /dashboard.
4. Setting `super_admin_only` mostra na sidebar apenas para super_admin; outros redirecionam.
5. Setting `all` mostra na sidebar para todos.
6. Matrix IA `none`: inbox 31 some de tabelas, charts, KPIs, drill-downs, dropdowns de filtros, meta-cache-for-user, e o relatório `matrix-ia` é redirecionado.
7. Matrix IA `super_admin_only`: super_admin vê tudo (incluindo dropdowns de filtros); outros não.
8. Matrix IA `all`: visível para todos.
9. Catálogo `PROVIDER_CATALOG.openai.models` inclui todos os modelos GPT-5.x listados; Anthropic inclui Sonnet 4.7; Gemini inclui 2.0 Pro novo; OpenRouter ≥ 40 itens.
10. Dropdown de Modelo do Nex abre por cima do card pai (não fica preso visualmente).
11. Ícone Eye na input de API key fica visualmente centralizado vertical.
12. Smoke test em produção: super_admin loga, troca settings, deploy reflete em <30s.

## 5. Riscos e mitigações

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Backward-compat quebra para deployments com flags legacy | Alto | Helpers leem flags antigas se as novas não existem. Seed grava as novas no startup. |
| Cache TTL atrasa reflexo de mudança de setting | Médio | Invalidate em `updateSetting`. Já tem padrão. |
| Pull de modelos OpenRouter via API em runtime | N/A | Catálogo estático. `allowCustomModel` cobre o resto. |
| Outro agente paralelo mexer em settings/llm-config | Médio | Protocolo `docs/agents/active/`. |
| Bug do dropdown não ser stacking context | Baixo | 2 hipóteses no plan, escolher quando inspecionar. |

## 6. Definição de pronto

- [ ] Migrations / seed atualizados.
- [ ] Helpers de visibility com tests TDD.
- [ ] UI cards refatorados com VisibilitySelect.
- [ ] Sidebar respeita visibility por role.
- [ ] 7 páginas `relatorios/<key>` com guard.
- [ ] Páginas dashboard e drill-downs herdam do guard.
- [ ] Queries Chatwoot recebem visibility resolvido (não boolean).
- [ ] Filtros / dropdowns / meta-cache escondem inbox 31 quando aplicável.
- [ ] Tools Nex herdam visibility.
- [ ] Catálogo LLM atualizado (4 providers).
- [ ] Bug dropdown preso corrigido.
- [ ] Bug olhinho centralizado.
- [ ] Tests verdes (typecheck + lint + jest).
- [ ] Deploy v0.11.0 em produção.
- [ ] CHANGELOG, STATUS, runbook atualizados.
- [ ] HISTORY.md com entradas dos commits relevantes.
