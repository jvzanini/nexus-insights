import type { ReactNode } from "react";

interface Props {
  text: string | null | undefined;
  term?: string;
}

/**
 * Walk char a char construindo (normalized, map[normIdx] → originalIdx).
 * Permite slice do texto ORIGINAL com índices do match no normalizado.
 *
 * Known limitation: surrogate pairs (emoji) podem não destacar 100%
 * porque iteramos por code units, não code points. Aceitável para
 * dados Chatwoot pt-BR onde emoji em campos pesquisáveis é raro.
 */
function buildIndexMap(text: string): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const norm = ch.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
    for (let j = 0; j < norm.length; j++) {
      normalized += norm[j];
      map.push(i);
    }
  }
  return { normalized, map };
}

/**
 * Envolve cada ocorrência (case + acento-insensitive) de `term` em `text`
 * com <mark> estilizado em violet sutil. Sem term ou texto vazio: retorna
 * o texto original.
 *
 * v0.25: normalize NFD para casar acentos (busca "joao" destaca "João",
 * preservando acentos no render).
 *
 * Match: substring contains (não prefix). Sem regex (seguro contra chars
 * especiais). O(n) por chamada.
 */
export function HighlightedText({ text, term }: Props) {
  if (text == null) return null;
  const trimmed = term?.trim();
  if (!trimmed) return <>{text}</>;

  const { normalized, map } = buildIndexMap(text);
  const lowerTerm = trimmed
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
  if (!lowerTerm) return <>{text}</>;

  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let counter = 0;
  let idx = normalized.indexOf(lowerTerm);
  while (idx !== -1) {
    const startOrig = map[idx]!;
    const endOrig = (map[idx + lowerTerm.length - 1] ?? text.length - 1) + 1;
    if (startOrig > lastIdx) parts.push(text.slice(lastIdx, startOrig));
    parts.push(
      <mark
        key={`m${counter++}`}
        className="rounded-sm bg-violet-500/15 px-0.5 font-semibold text-violet-500"
      >
        {text.slice(startOrig, endOrig)}
      </mark>,
    );
    lastIdx = endOrig;
    idx = normalized.indexOf(lowerTerm, idx + lowerTerm.length);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

export default HighlightedText;
