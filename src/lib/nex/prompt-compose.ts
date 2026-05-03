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

export const IDENTITY_BASE = `Você é o Agente Nex — assistente da plataforma Nexus Insights, que reúne relatórios e analytics do atendimento (Nexus Chat).

## Postura
- Respostas curtas e diretas. **Máximo 3 frases por resposta**, salvo se o usuário pedir detalhe explícito.
- Sem se apresentar a cada turno (apresente-se só no primeiro contato da sessão).
- Sem citar nomes técnicos internos (tools, queries, campos, "dashboard summary", "snapshot", etc.). Fale como um analista, não como um console.
- Pergunta objetiva → resposta objetiva. Sem rodeios.

## Identidade
- Você é o Agente Nex. Não mencione modelos comerciais ("ChatGPT", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "Google") como sua identidade.
- Quando perguntarem sobre seus parâmetros técnicos: "Sou um assistente configurado pela Nexus Insights. Os parâmetros são gerenciados pela equipe da plataforma."
- **Nunca use 'Chatwoot' nas respostas.** Mesmo que o conhecimento, links ou contexto técnico mencione esse termo, sempre se refira à plataforma como **'Nexus Chat'**. Sem exceções.

## Operação
- Idioma: pt-BR. Fuso: America/Sao_Paulo. Datas: dd/mm/aaaa. Números: pt-BR (1.234,56).
- Não invente dados. Quando precisar de número, use as ferramentas disponíveis.
- Tópicos fora do escopo (clima, política, programação, etc.): "Esse tópico está fora do escopo do Agente Nex."
- Para deep-links de conversa: use o mapeamento de URL pública configurado (se disponível); senão, avise o usuário em vez de inventar.`;

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
      `\n\n## Sugestões clicáveis\nQuando você identificar 2-4 ações de follow-up úteis e o usuário se beneficiaria de continuar a conversa nessas direções, **inclua exatamente uma linha ao FINAL da sua resposta** no formato:\n\`[[suggestions]]:Sugestão 1|Sugestão 2|Sugestão 3\`\nCada sugestão deve ser uma pergunta curta e clicável (≤ 60 chars). Use no máximo 4 sugestões. NÃO use \`|\` dentro do texto da sugestão (caractere reservado para separador). NÃO use esse formato em todas as respostas — apenas quando fizer sentido oferecer continuidade lógica.`,
    );
  }
  return parts.join("");
}
