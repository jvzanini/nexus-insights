/**
 * Normalização canônica de País e Estado do contato Chatwoot.
 *
 * Módulo PURO, sem dependências de I/O. É a ÚNICA fonte da verdade para
 * transformar valores crus e sujos (vindos do banco real) em rótulos
 * canônicos no formato `"UF-Nome"` (estado) e `"Brasil"` (país).
 *
 * Os dados crus são sujos:
 * - País: "Brasil" / "Brazil" / "BR" / "" / null.
 * - Estado: majoritariamente "UF-Nome do Estado" (ex.: "MG-Minas Gerais"),
 *   mas com cauda suja: cidades soltas, typos, caixa variada, prefixos
 *   trocados, etc.
 */

export const ESTADOS: ReadonlyArray<{ uf: string; nome: string }> = [
  { uf: "AC", nome: "Acre" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" },
  { uf: "BA", nome: "Bahia" },
  { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PA", nome: "Pará" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
];

export const ESTADO_FALLBACK = "ZZ-Outros Estados";

/** Remove diacríticos (NFD) e baixa a caixa. */
function deburr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Colapsa espaços múltiplos e trim. */
function squish(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Formata o rótulo canônico de um estado. */
function canonical(uf: string, nome: string): string {
  return `${uf}-${nome}`;
}

const UF_SET = new Set(ESTADOS.map((e) => e.uf));
const ESTADO_BY_UF = new Map(ESTADOS.map((e) => [e.uf, e]));

/**
 * Lista de estados ordenada pelo nome deburrado MAIS LONGO primeiro.
 * Garante que "Mato Grosso do Sul" case antes de "Mato Grosso".
 */
const ESTADOS_BY_NAME_LEN = [...ESTADOS]
  .map((e) => ({ ...e, deburr: deburr(e.nome) }))
  .sort((a, b) => b.deburr.length - a.deburr.length);

/**
 * Dicionário de cidades conhecidas → UF. Chave = deburr(cidade).
 * Inclui as 27 capitais + cidades observadas nos dados reais.
 */
const CIDADE_TO_UF: Record<string, string> = {
  // 27 capitais
  "rio branco": "AC",
  "maceio": "AL",
  "macapa": "AP",
  "manaus": "AM",
  "salvador": "BA",
  "fortaleza": "CE",
  "brasilia": "DF",
  "vitoria": "ES",
  "goiania": "GO",
  "sao luis": "MA",
  "cuiaba": "MT",
  "campo grande": "MS",
  "belo horizonte": "MG",
  "belem": "PA",
  "joao pessoa": "PB",
  "curitiba": "PR",
  "recife": "PE",
  "teresina": "PI",
  "rio de janeiro": "RJ",
  "natal": "RN",
  "porto alegre": "RS",
  "porto velho": "RO",
  "boa vista": "RR",
  "florianopolis": "SC",
  "sao paulo": "SP",
  "aracaju": "SE",
  "palmas": "TO",
  // cidades observadas nos dados reais
  "maracanau": "CE",
  "anapolis": "GO",
  "contagem": "MG",
  "juiz de fora": "MG",
  "mariana": "MG",
  "crato": "CE",
  "itabuna": "BA",
  "cidade ocidental": "GO",
  "lucas do rio verde": "MT",
};

export function normalizeCountry(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const d = deburr(trimmed);
  if (d === "brasil" || d === "brazil" || d === "br") return "Brasil";
  return trimmed;
}

export function normalizeEstado(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = squish(raw);
  if (value === "") return null;

  // 2. Fallback explícito já canônico.
  if (value === ESTADO_FALLBACK) return ESTADO_FALLBACK;

  const valueDeburr = deburr(value);

  // 3. Nome de estado completo presente (substring deburrada). Mais longo vence.
  for (const e of ESTADOS_BY_NAME_LEN) {
    if (valueDeburr.includes(e.deburr)) {
      return canonical(e.uf, e.nome);
    }
  }

  // 4. Sigla UF como token isolado de 2 letras.
  const tokens = valueDeburr.split(/[\s\-,]+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok.length === 2) {
      const uf = tok.toUpperCase();
      if (UF_SET.has(uf)) {
        const e = ESTADO_BY_UF.get(uf)!;
        return canonical(e.uf, e.nome);
      }
    }
  }

  // 5. Cidade conhecida (string inteira ou primeiro segmento antes de hífen/vírgula).
  const firstSegment = squish(value.split(/[-,]/)[0] ?? "");
  const candidates = [valueDeburr, deburr(firstSegment)];
  for (const cand of candidates) {
    const uf = CIDADE_TO_UF[cand];
    if (uf) {
      const e = ESTADO_BY_UF.get(uf)!;
      return canonical(e.uf, e.nome);
    }
  }

  // 6. Nada casou.
  return ESTADO_FALLBACK;
}

// ---------------------------------------------------------------------------
// Derivação de opções de filtro (País / Estado) a partir das linhas
// ---------------------------------------------------------------------------

/** Item de opção para os MultiSelect de País/Estado. */
export interface LocationOption {
  id: number;
  name: string;
}

/** Índice de ordenação de cada UF conforme a posição em ESTADOS. */
const UF_ORDER = new Map(ESTADOS.map((e, i) => [e.uf, i]));

/** Extrai o prefixo "UF" de um rótulo canônico "UF-Nome". */
function ufPrefix(label: string): string {
  const idx = label.indexOf("-");
  return idx === -1 ? label : label.slice(0, idx);
}

/**
 * Deriva a lista de opções distintas (País ou Estado) a partir das linhas já
 * normalizadas. Função PURA.
 *
 * Tipagem estrutural mínima do input (em vez de importar `ConversaRow`) para
 * evitar ciclo de import com `conversas-list.ts`.
 *
 * Ordenação:
 *  - `estado`: pela posição da UF em ESTADOS; `ESTADO_FALLBACK`
 *    ("ZZ-Outros Estados") SEMPRE por último; valores cuja UF não está em
 *    ESTADOS (não deveria ocorrer pós-normalização) vêm antes do ZZ, em
 *    ordem alfabética (pt-BR).
 *  - `country`: ordem alfabética (pt-BR, `localeCompare`).
 *
 * `id` é o índice 1-based na lista JÁ ordenada; `name` é o valor canônico.
 */
export function buildLocationOptions(
  rows: ReadonlyArray<{ contact: { country: string | null; estado: string | null } }>,
  field: "country" | "estado",
): LocationOption[] {
  const distinct = new Set<string>();
  for (const r of rows) {
    const value = r.contact[field];
    if (value != null) distinct.add(value);
  }

  const values = [...distinct];

  if (field === "country") {
    values.sort((a, b) => a.localeCompare(b, "pt-BR"));
  } else {
    values.sort((a, b) => {
      const aFallback = a === ESTADO_FALLBACK;
      const bFallback = b === ESTADO_FALLBACK;
      if (aFallback !== bFallback) return aFallback ? 1 : -1;

      const aOrder = UF_ORDER.get(ufPrefix(a));
      const bOrder = UF_ORDER.get(ufPrefix(b));

      // Ambos conhecidos: ordena pela posição da UF em ESTADOS.
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      // Desconhecidos (não esperado) vêm antes dos conhecidos? Não: a regra é
      // "antes do ZZ, em ordem alfabética". Conhecidos já vêm ordenados por UF;
      // desconhecidos entram alfabeticamente entre si e relativos aos conhecidos.
      if (aOrder == null && bOrder == null) return a.localeCompare(b, "pt-BR");
      // Um conhecido, outro não: mantém estabilidade ordenando por nome.
      return a.localeCompare(b, "pt-BR");
    });
  }

  return values.map((name, i) => ({ id: i + 1, name }));
}
