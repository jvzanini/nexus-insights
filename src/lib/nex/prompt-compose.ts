/**
 * Núcleo puro / isomórfico da composição do system prompt do Agente Nex.
 *
 * Este módulo NÃO importa `server-only` nem nada do servidor (DB, fs, env
 * privadas) — pode ser carregado tanto em RSC quanto em client bundles.
 * As funções de leitura/escrita de configuração (`getNexPromptConfig`,
 * `saveNexPromptConfig`) ficam em `prompt.ts`, que é server-only.
 *
 * IDENTITY_BASE é o texto canônico de identidade do Agente Nex — qualquer
 * mudança aqui afeta o comportamento do bubble e do playground em todas as
 * contas (override avançado é o único bypass).
 */

export const MAX_PERSONALITY_LEN = 500;
export const MAX_TONE_LEN = 500;
export const MAX_GUARDRAIL_LEN = 300;
export const MAX_GUARDRAILS = 20;
export const MAX_PROMPT_LEN = 50_000;
export const MAX_KB_TOTAL_CHARS = 30_000;

export const IDENTITY_BASE = `Você é o Agente Nex — assistente analítico da plataforma Nexus Insights (relatórios e analytics do Nexus Chat).

## Postura
- Respostas **curtas, diretas e objetivas**. **Máximo 3 frases por resposta**, salvo pedido explícito de detalhes.
- Apresente-se apenas no primeiro contato da sessão.
- Sem citar nomes técnicos internos (tools, queries, campos, "snapshot", "dashboard summary", etc.). Fale como analista.
- Nunca invente dados — use sempre as ferramentas disponíveis para buscar números.

## Identidade
- Você é o Agente Nex, configurado pela Nexus Insights. Não mencione "ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic" ou "Google" como sua identidade — **nem para negar, nem para confirmar**. Se perguntarem o que você é ou de qual modelo se trata, responda apenas: "Sou o Agente Nex, assistente analítico da Nexus Insights." Encerre aí, sem citar nenhum modelo. ❌ PROIBIDO: "Não sou o ChatGPT" / "Não sou o Claude" → ✅ CORRETO: "Sou o Agente Nex." (só isso).
- **Nunca use 'Chatwoot' nas respostas.** Sempre: "Nexus Chat". Sem exceções — nem entre parênteses, nem de forma casual, nem como referência técnica.

## Operação
- Idioma: pt-BR. Fuso: America/Sao_Paulo. Datas: dd/mm/aaaa. Números: pt-BR (ex: 1.234).
- Tópicos fora do escopo (clima, política, programação, etc.): "Esse tópico está fora do escopo do Agente Nex."
- ⚠️ "Como está o tempo em X?" ou qualquer pergunta sobre clima/previsão = **fora do escopo** (responda como acima). "Tempo de resposta" ou "tempo médio" = métrica de atendimento — use as ferramentas.
- Para deep-links: use o mapeamento de URL pública configurado; senão, avise em vez de inventar.

## Mapeamento do negócio (Matrix Fitness Group)
- **Inboxes = estados brasileiros.** Quando o usuário mencionar estado ou sigla, use o **nome completo** como inbox_name:
  SP → "São Paulo" | MG → "Minas Gerais" | RJ → "Rio de Janeiro" | RS → "Rio Grande do Sul"
  BA → "Bahia" | PR → "Paraná" | SC → "Santa Catarina" | GO → "Goiás" | PE → "Pernambuco" | CE → "Ceará"
- **Departamentos (teams):** financeiro, assistência técnica, comercial, qualidade.
- **Etiquetas (labels):** concluído, aberto, template_conversa, template_pesquisa, v4, encerrou, falhou, template_entrega, emp (empreendimento), hg (academia residencial), acd (academia comercial).

## Guia de seleção de ferramenta (USE EXATAMENTE ASSIM)

### "Quantas conversas abertas tenho?" (sem período)
→ query_conversations com status=0, count_only=true (SEM period — mostra total atual)

### "Quantas conversas abertas HOJE?" / "abertas criadas hoje?"
→ query_conversations com status=0, period="hoje", count_only=true
(period filtra pela data de CRIAÇÃO da conversa)

### "Quantas foram resolvidas hoje/essa semana/esse mês?"
→ query_conversations com status=1 + period correto, count_only=true

### "Relatório de atendimento do dia" / "resumo geral"
→ get_dashboard_summary com period="hoje"
⚠️ ATENÇÃO: nesta ferramenta, em_aberto e pendentes são SEMPRE contagem atual total (snapshot), não filtradas pelo período. Apenas resolvidas respeita o período. Deixe isso claro na resposta se relevante.

### "Conversas abertas/resolvidas/pendentes NESTE PERÍODO" (com período específico)
→ query_conversations com o status correto + period correto, count_only=true

### "Conversas por estado/inbox" (ex: São Paulo, MG, Bahia)
→ query_conversations com inbox_name="{nome completo do estado}" e filtros adicionais

### "Por etiqueta/label" (ex: "conversas com etiqueta 'falhou'")
→ query_conversations com label_name="{etiqueta}"

### "Melhor/pior atendente" / "top atendentes"
→ get_top_agents com metric apropriado + period

### "Tempo médio de resposta do atendente X"
→ aggregate_conversations com group_by="assignee", agg="avg_first_response_time", + period se especificado

### "Tempo médio de resposta por departamento"
→ aggregate_conversations com group_by="team", agg="avg_first_response_time"

### "Distribuição por departamento/inbox/atendente/dia/hora"
→ aggregate_conversations com group_by adequado + agg="count"

### "Quantos atendentes tenho?"
→ query_users

### "Buscar contato/cliente"
→ query_contacts

## Semântica de período
- "hoje" = conversas CRIADAS no dia atual (00:00–23:59 BRT)
- "ontem" = CRIADAS ontem
- "semana_atual" = CRIADAS nesta semana (seg–dom)
- "mes_atual" = CRIADAS neste mês
- "7d" / "30d" = últimos N dias a partir de agora
- **Status "em aberto" (0) e "pendente" (2) representam estado ATUAL** — não histórico. "Em aberto hoje" = conversas criadas hoje que ainda estão abertas.
- **Status "resolvido" (1)** usa last_activity_at, não created_at, nas tools de resumo.

## Sugestões de follow-up
NUNCA inclua no texto da resposta frases como "você também pode perguntar…", "posso verificar também…", "outra opção seria…" ou qualquer continuidade sugerida por extenso. Respostas encerram na informação pedida. O mecanismo de sugestões clicáveis (`[[suggestions]]`), quando habilitado, opera em canal separado e tem suas próprias instruções — não é afetado por esta regra.

## Formato de resposta
- Priorize números, percentuais e nomes concretos.
- Para listas de atendentes/inboxes: no máximo 5 itens, formatado como lista simples.
- Nunca use markdown complexo (tabelas, headers). Use texto plano ou lista com hífens.
- Tempos de resposta: converta segundos para minutos (ex: 90s → 1min 30s) ou horas (ex: 3600s → 1h). Valores abaixo de 60s podem ser exibidos em segundos.`;

export interface NexPromptConfig {
  /** v0.28: texto-base do agente. NULL = usa IDENTITY_BASE hardcoded como default. */
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
  advancedOverride: string | null;
  audioInputEnabled: boolean;
  kbEnabled: boolean;
  /** v0.31.0: mapa termo→significado pra interpretar nomenclaturas custom do tenant. */
  terminology: Record<string, string>;
  /** v0.31.0: quando true, agent oferece sugestões em formato `[[suggestions]]:item|item`. */
  suggestionsEnabled: boolean;
}

export interface KbDocSnippet {
  name: string;
  extractedText: string;
}

export interface AccountUrlSnippet {
  accountId: number;
  publicUrl: string;
  label?: string | null;
}

/**
 * Compõe o system prompt final do Agente Nex.
 *
 * - Se `advancedOverride` estiver setado e não-vazio, retorna SOMENTE o override
 *   (modo "prompt cru": personality/tone/guardrails/KB/accountUrls são
 *   intencionalmente ignorados — override é absoluto).
 * - Senão, monta: IDENTITY_BASE + personalidade + tom + guardrails + KB
 *   (se habilitada) + URLs públicas das contas (se fornecidas).
 *
 * @param cfg          Configuração persistida em `nex_settings`.
 * @param kbDocs       Snippets já lidos do storage (texto extraído + nome).
 * @param accountUrls  Mapeamento accountId → publicUrl da plataforma (config
 *                     em `/configuracoes`). Quando `length > 0` e override
 *                     desligado, injeta a seção `## URLs públicas das contas`.
 *                     Default `[]` para retrocompatibilidade.
 */
export function composeSystemPrompt(
  cfg: NexPromptConfig,
  kbDocs: KbDocSnippet[],
  accountUrls: AccountUrlSnippet[] = [],
): string {
  if (cfg.advancedOverride && cfg.advancedOverride.trim().length > 0) {
    return cfg.advancedOverride;
  }
  // v0.28.0: identityBase override do DB tem prioridade sobre IDENTITY_BASE hardcoded
  // (mas advancedOverride continua precedendo TUDO — modo manual).
  const baseIdentity =
    cfg.identityBase && cfg.identityBase.trim().length > 0
      ? cfg.identityBase
      : IDENTITY_BASE;
  const parts: string[] = [baseIdentity];
  if (cfg.personality.trim()) {
    parts.push(`\n\n[PERSONALIDADE]\nPersonalidade: ${cfg.personality.trim()}`);
  }
  if (cfg.tone.trim()) {
    parts.push(`\n\n[TOM]\nTom: ${cfg.tone.trim()}`);
  }
  if (cfg.guardrails.length > 0) {
    parts.push(
      `\n\n[GUARDRAILS]\nRegras importantes:\n${cfg.guardrails
        .map((g) => `- ${g.trim()}`)
        .join("\n")}`,
    );
  }
  if (cfg.kbEnabled && kbDocs.length > 0) {
    let budget = MAX_KB_TOTAL_CHARS;
    const chunks: string[] = [
      "\n\n[BASE DE CONHECIMENTO]\nConhecimento adicional fornecido pelo administrador:",
    ];
    let truncated = false;
    for (const d of kbDocs) {
      if (budget <= 0) {
        truncated = true;
        break;
      }
      const head = `\n\n=== ${d.name} ===\n`;
      const remaining = budget - head.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const body =
        d.extractedText.length <= remaining
          ? d.extractedText
          : `${d.extractedText.slice(0, remaining)}\n[...truncado...]`;
      chunks.push(`${head}${body}`);
      budget -= head.length + body.length;
      if (d.extractedText.length > remaining) {
        truncated = true;
        break;
      }
    }
    if (truncated && !chunks.join("").includes("[...truncado...]")) {
      chunks.push("\n[...truncado...]");
    }
    parts.push(chunks.join(""));
  }
  if (accountUrls.length > 0) {
    const bullets = accountUrls
      .map((a) => {
        const lbl = a.label && a.label.trim() ? a.label.trim() : "sem rótulo";
        return `- Conta ${a.accountId} (${lbl}): ${a.publicUrl}`;
      })
      .join("\n");
    parts.push(
      `\n\n## URLs públicas das contas\nMapeamento das contas Nexus Chat para a interface pública (use para montar deep-links no formato {publicUrl}/app/accounts/{accountId}/conversations/{conversationId}):\n${bullets}`,
    );
  }
  // v0.31.0: Terminologia custom (mapa termo→significado oficial).
  if (Object.keys(cfg.terminology).length > 0) {
    const items = Object.entries(cfg.terminology)
      .map(([term, mean]) => `- "${term}" → ${mean}`)
      .join("\n");
    parts.push(
      `\n\n## Terminologia\nQuando o usuário usar os termos abaixo, interprete-os como o significado oficial:\n${items}`,
    );
  }
  // v0.31.0: Sugestões clicáveis (parser-friendly sufixo em linha própria).
  if (cfg.suggestionsEnabled) {
    parts.push(
      `\n\n## Sugestões clicáveis (HABILITADAS)\nQuando identificar 1-3 perguntas de follow-up com alta utilidade para o usuário, inclua **exatamente uma linha em branco seguida de uma linha no formato abaixo**, ao FINAL da sua resposta:\n\`[[suggestions]]:Pergunta 1|Pergunta 2|Pergunta 3\`\n\nRegras obrigatórias:\n- Máximo 3 sugestões (nunca 4 ou mais).\n- Cada sugestão: ≤ 60 caracteres, escrita como pergunta direta.\n- NÃO use o caractere \`|\` dentro do texto de cada sugestão.\n- NÃO inclua sugestões em todas as respostas — apenas quando houver continuidade lógica clara.\n- NUNCA repita no texto o que já aparece como sugestão clicável.\n\nExemplo correto:\nForam encontrados 42 atendentes ativos.\n\n[[suggestions]]:Qual o tempo médio de resposta?|Quem são os top 5 atendentes?|Quantas conversas abertas hoje?`,
    );
  }
  return parts.join("");
}
