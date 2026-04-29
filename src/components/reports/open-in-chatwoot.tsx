"use client";

import { ExternalLink } from "lucide-react";
import { chatwootConversationUrl } from "@/lib/chatwoot/deep-link";

interface OpenInChatwootProps {
  accountId: number;
  displayId: number;
}

export function OpenInChatwoot({ accountId, displayId }: OpenInChatwootProps) {
  const href = chatwootConversationUrl(accountId, displayId);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir conversa #${displayId} no Chatwoot`}
      className="text-violet-500 hover:text-violet-400 inline-flex items-center gap-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Abrir
    </a>
  );
}
