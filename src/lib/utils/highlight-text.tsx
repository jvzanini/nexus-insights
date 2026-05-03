import type { ReactNode } from "react";

interface Props {
  text: string | null | undefined;
  term?: string;
}

/**
 * Envolve cada ocorrência (case-insensitive) de `term` em `text` com <mark>
 * estilizado em violet sutil. Sem term ou texto vazio: retorna o texto original.
 *
 * Match: substring contains (não prefix). Sem regex (seguro contra chars
 * especiais). O(n) por chamada.
 */
export function HighlightedText({ text, term }: Props) {
  if (text == null) return null;
  const trimmed = term?.trim();
  if (!trimmed) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerTerm = trimmed.toLowerCase();
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let counter = 0;
  let idx = lowerText.indexOf(lowerTerm);
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <mark
        key={`m${counter++}`}
        className="rounded-sm bg-violet-500/15 px-0.5 font-semibold text-violet-500"
      >
        {text.slice(idx, idx + lowerTerm.length)}
      </mark>,
    );
    lastIdx = idx + lowerTerm.length;
    idx = lowerText.indexOf(lowerTerm, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

export default HighlightedText;
