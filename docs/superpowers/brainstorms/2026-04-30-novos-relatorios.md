# Brainstorm — Próximos relatórios para Nexus Insights

> **Status:** brainstorm para avaliação. Sem código ainda. O João escolhe quais ideias virar spec na próxima rodada.
> **Data:** 2026-04-30
> **Autor:** Claude (modo autônomo) + benchmarks de Intercom, Zendesk, Freshdesk, Help Scout, Front, HubSpot Service Hub, Gorgias, Chatwoot Enterprise, Observe.AI / Cresta.

---

## 1. Diagnóstico — o que já temos (v0.7.0)

**Relatórios atuais e o que entregam:**
- **Visão Geral** — pizza de status + volumetria simples.
- **Performance** — tempos de resposta + SLA + CSAT (parcialmente alimentado).
- **Equipe** — ranking de atendentes + departamento.
- **Distribuição** — heatmap horário × dia da semana.
- **Origem & IA** — leads recebidos + Matrix IA.
- **Conversas** — lista detalhada (15 colunas + filtros + ordenação).
- **Mensagens não respondidas** — backlog em aberto.

**O que NÃO temos hoje:**
- Métricas de **qualidade individual** (FCR, reopen rate, transfer rate).
- **Análise temática** (clusterização de assuntos / FAQs).
- **Predição** (forecast de volume, churn de cliente, alerta de conversa em risco).
- **Análise de cohort** / jornada do cliente.
- **Conversão / negócio** (lead → matrícula, ROI de canal).
- **Compliance** (mensagens fora de horário, tom inadequado, audit).
- **Operacional em tempo real** (queue ao vivo, SLA breach prediction).
- **Pulse / variação semanal** (esta semana vs semana passada vs mesmo período do mês anterior).

---

## 2. Schema Chatwoot — o que está disponível

### Tabelas core (OSS confirmado pelo uso nas queries atuais)

| Tabela | Uso atual | Subutilizada |
|--------|-----------|--------------|
| `conversations` | sim — todas as queries | `custom_attributes`, `additional_attributes`, `last_activity_at`, `priority` |
| `messages` | sim — `private`, `message_type` | `content_type`, `attachment_data`, `sender_type`, `sender_id`, edições |
| `inboxes` | sim — id, name | `channel_type`, `email`, `phone_number` (configs por canal) |
| `teams` | sim — id, name | `description`, `allow_auto_assign` |
| `users` | sim — id, name, email | `availability_status`, `last_sign_in_at`, `confirmed_at`, `role` |
| `account_users` | sim | `availability` por conta |
| `contacts` | sim — name, phone, identifier, additional_attributes | `email`, `last_activity_at`, `created_at` (idade do contato) |
| `taggings` + `tags` | parcial — só labels da tabela conversas | analytics de tags (top tags, evolução, combinações) |
| `reporting_events` | sim — first_response, conversation_resolved | `conversation_bot_resolved`, `conversation_missed`, eventos custom |
| `conversation_participants` | **não usada** | colaboração / observadores numa conversa |
| `notes` (em contacts) | **não usada** | anotações dos atendentes |
| `csat_survey_responses` | **não usada** (mas Performance referencia) | scores e comentários de pesquisa |
| `attachments` | **não usada** | volume de mídias, tempo gasto baixando |
| `automation_rules` | **não usada** | quais regras estão disparando, eficácia |
| `mentions` | **não usada** | menções a outros agentes em notas internas |
| `audit_logs` (Chatwoot Enterprise) | provavelmente ausente em OSS | — |

### Dados ricos não-óbvios

- `conversations.custom_attributes` (jsonb) — atributos do contato/lead que a equipe Matrix preenche.
- `contacts.additional_attributes` (jsonb) — pode ter `city`, `country`, `social_profiles`.
- `messages.private = true` → notas internas (dá para medir colaboração interna).
- `messages.message_type` → 0 incoming, 1 outgoing, 2 activity, 3 template.
- `reporting_events.value_in_business_hours` → tempo apenas em horário comercial.
- `conversations.priority` → urgent/high/medium/low (subutilizado).
- `conversations.last_activity_at` vs `c.created_at` → tempo de vida da conversa.

---

## 3. Catálogo de ideias — 52 relatórios novos

> Cada ideia tem: **nome**, categoria (A-J), inspiração, métrica chave, valor pra Matrix, dados, complexidade.
> Categorias: A=Volumetria avançada · B=Performance individual · C=Performance equipe · D=CX · E=Conteúdo/Temas · F=Produtividade · G=Negócio · H=Operacional/Real-time · I=Compliance · J=Predição/IA.

---

### A. Volumetria avançada

**1. Forecast 7 dias (linha histórica + projeção)** — A · *Intercom Forecasting*
Métrica: volume de novas conversas prevista para os próximos 7 dias com banda de confiança.
Valor: dimensionar escala. Saber se vai precisar de plantão extra na próxima sexta.
Dados: `conversations.created_at` (12 meses). Modelo: regressão sazonal simples ou Holt-Winters.
Complexidade: Média.

**2. Detector de anomalia diária** — A · *Zendesk Explore Anomaly*
Métrica: alerta quando volume diário > 2 desvios-padrão da baseline da mesma DOW.
Valor: reagir rápido a picos atípicos (campanha viral, problema crítico).
Dados: `conversations.created_at`. Cálculo z-score on-the-fly.
Complexidade: Baixa.

**3. Pulse semanal: esta semana × semana passada × mesma semana mês passado** — A · *Front Pulse*
Métrica: 4 KPIs (volume, FRT, CSAT, resolved) em três colunas comparativas com setas Δ%.
Valor: visão de pulso instantânea sem filtrar manualmente.
Dados: `conversations`, `reporting_events`.
Complexidade: Baixa.

**4. Mapa de calor "horário ofensivo"** — A · *original*
Métrica: combinação hora × DOW que tem o pior tempo de resposta médio histórico.
Valor: descobrir buracos de cobertura ("toda quarta às 19h cai pra 2 atendentes").
Dados: `conversations.created_at` × `reporting_events` first_response.
Complexidade: Média.

**5. Volumetria por canal/inbox empilhada** — A · *Help Scout Channel*
Métrica: stacked area chart de volume por canal (WhatsApp, Site, etc.) ao longo do tempo.
Valor: ver migração de canais (clientes vindo mais pelo WhatsApp ao invés do site).
Dados: `conversations` × `inboxes.channel_type`.
Complexidade: Baixa.

**6. Sazonalidade por mês × ano (calendar heatmap)** — A · *GitHub-style*
Métrica: cada quadradinho é um dia, cor = volume.
Valor: planejamento anual, identificar épocas históricas de pico (campanhas, sazonalidade).
Dados: `conversations.created_at`.
Complexidade: Baixa.

---

### B. Performance individual

**7. First Contact Resolution (FCR) por atendente** — B · *Zendesk*
Métrica: % de conversas resolvidas sem passar por outro agente / sem reabrir em 24h.
Valor: indicador #1 de qualidade. Quem resolve de primeira é mais valioso.
Dados: `conversations.assignee_id`, `reporting_events` (resolution + reopens).
Complexidade: Média.

**8. Reopen Rate — taxa de reabertura** — B · *Help Scout*
Métrica: % de conversas marcadas resolved que voltaram a "open" em até 7 dias.
Valor: detectar atendimentos "empurrados" — fechou cedo demais.
Dados: `reporting_events` (`conversation_resolved` × `conversation_opened` mais tarde).
Complexidade: Média.

**9. Handle Time real (tempo ativo na conversa)** — B · *Intercom Productivity*
Métrica: tempo entre primeira mensagem do agente e resolved, descontando intervalos > 15 min sem atividade.
Valor: quanto tempo "real" cada conversa consome — diferente do tempo de calendário.
Dados: `messages.created_at` agrupados por conversa.
Complexidade: Alta (lógica de "pausas").

**10. Idle Time por atendente** — B · *Front*
Métrica: tempo médio entre conversas atribuídas (gap).
Valor: identificar quem está sobrecarregado vs quem está parado.
Dados: `conversations.assignee_id` + `last_activity_at`.
Complexidade: Média.

**11. Transfer Rate** — B · *Zendesk*
Métrica: % de conversas que mudaram de atendente ao menos uma vez.
Valor: alta transferência indica falta de conhecimento ou estrutura mal feita.
Dados: `audit_logs` ou `reporting_events` (depende de versão Chatwoot). Fallback: detectar via `team_id`/`assignee_id` mudanças (precisa investigar).
Complexidade: Alta.

**12. Score 360° do atendente** — B · *Observe.AI / Cresta*
Métrica: índice composto = velocidade (TTR) + qualidade (FCR + reopen) + volume + CSAT — normalizado 0-100.
Valor: ranking justo que evita "pega só fáceis" ou "responde rápido sem resolver".
Dados: combinação dos relatórios B7-10 + CSAT.
Complexidade: Média.

**13. Curva de aprendizado de novo atendente** — B · *Intercom Onboarding Reports*
Métrica: TTR e FCR de cada atendente nas primeiras N semanas vs média da equipe.
Valor: identificar quem precisa de coaching extra, mostrar progressão de novatos.
Dados: `users.created_at` ou `confirmed_at` + relatórios B7-10.
Complexidade: Média.

**14. Top 5 / Bottom 5 com motivos** — B · *original*
Métrica: ranking dos 5 melhores e 5 piores por critério (TTR, CSAT, FCR), com drill-down.
Valor: "mostra quem precisa de ajuda" + reconhecimento dos top.
Dados: derivado dos demais.
Complexidade: Baixa.

---

### C. Performance equipe / departamento

**15. Load Balance entre atendentes** — C · *Help Scout Workload*
Métrica: distribuição de conversas atribuídas (boxplot ou histograma por agente).
Valor: ver se a fila está distribuída uniformemente ou concentrada em poucos.
Dados: `conversations.assignee_id` count.
Complexidade: Baixa.

**16. Occupancy % por atendente** — C · *call center pattern*
Métrica: % do tempo em horário de trabalho com pelo menos uma conversa atribuída em open.
Valor: medir uso real do agente vs tempo "logado".
Dados: `users.availability_status` (se rastreado) + `conversations` em aberto por atendente ao longo do tempo.
Complexidade: Alta.

**17. Backlog em pé (queue depth) por dia** — C · *Front Queue*
Métrica: linha histórica de "quantas conversas ficaram em aberto > 1h ao longo do dia".
Valor: ver onde a fila bate o teto.
Dados: snapshot diário derivado de `conversations.created_at` + `last_activity_at`.
Complexidade: Média.

**18. Comparativo entre departamentos** — C · *HubSpot Service*
Métrica: mesmas métricas (volume, TTR, CSAT, FCR) lado a lado por team.
Valor: comparar "Comercial" vs "Suporte" vs "Pós-venda".
Dados: `conversations.team_id`.
Complexidade: Baixa.

**19. Coverage por turno / horário** — C · *Zendesk WFM*
Métrica: agentes online vs volume de entrada por hora.
Valor: identificar quando há undercoverage real.
Dados: precisa shifting/escala (custom_attributes em users? ou config externa).
Complexidade: Alta — depende de dado externo de escala.

**20. Heatmap de "primeira mensagem do contato" vs "primeira resposta"** — C · *original*
Métrica: célula = tempo médio até primeira resposta para conversas iniciadas naquela hora × DOW.
Valor: cruzar volume × performance no mesmo gráfico.
Dados: `conversations.created_at` × `reporting_events` first_response.
Complexidade: Média.

---

### D. Experiência do cliente (CX)

**21. CSAT detalhado (já tem schema, falta povoar/expor)** — D · *Help Scout Happiness*
Métrica: distribuição de ratings + comentários + ratings por atendente.
Valor: voz do cliente para coaching.
Dados: `csat_survey_responses` (se existir).
Complexidade: Baixa (só consumir).

**22. NPS calculado a partir do CSAT** — D · *NPS classic*
Métrica: % promoters - % detractors com base no CSAT (≥4 promoter, ≤2 detractor).
Valor: KPI executivo único.
Dados: `csat_survey_responses`.
Complexidade: Baixa.

**23. Tempo de espera percebido (Customer Effort Score proxy)** — D · *CES literature*
Métrica: para cada conversa, quantas mensagens o cliente teve que mandar até receber primeira resposta.
Valor: fricção real do cliente.
Dados: `messages.message_type=0` (incoming) antes do primeiro outgoing.
Complexidade: Média.

**24. Sentimento da conversa (positivo/neutro/negativo)** — D · *Observe.AI*
Métrica: análise de sentimento via LLM (Nex tools) das últimas mensagens do cliente.
Valor: detectar conversas em risco antes de virar churn.
Dados: `messages.content` + LLM call.
Complexidade: Alta (custo LLM).

**25. Customer Health Score por contato** — D · *HubSpot Service*
Métrica: score 0-100 por contato baseado em frequência, CSAT, sentimento, tempo desde último contato.
Valor: priorizar atendimento de contatos frios ou em risco.
Dados: `contacts` + agregações.
Complexidade: Alta.

**26. Cohort de retorno do cliente** — D · *Mixpanel cohort*
Métrica: % de contatos que voltam a abrir conversa em 30/60/90 dias após primeira interação.
Valor: medir engajamento real ao longo do tempo.
Dados: `contacts.id` × `conversations.created_at`.
Complexidade: Média.

**27. Tempo até primeira solução (não primeira resposta)** — D · *Intercom Resolution*
Métrica: tempo entre primeira mensagem e resolved (não confundir com first response).
Valor: o cliente não quer "olá", quer solução.
Dados: `conversations.created_at` × `reporting_events.conversation_resolved`.
Complexidade: Baixa.

---

### E. Conteúdo / temas

**28. Top tags por período + evolução** — E · *Help Scout Tags Report*
Métrica: top 20 tags + variação Δ% vs período anterior.
Valor: identificar temas emergentes (problema novo, dúvida recorrente).
Dados: `taggings` + `tags`.
Complexidade: Baixa.

**29. Combinações de tags mais comuns** — E · *original*
Métrica: pares/triplas de tags que aparecem juntas (ex: "matrícula" + "pagamento" + "cartão").
Valor: descobrir cenários compostos para criar respostas prontas.
Dados: `taggings` agrupados por conversation_id.
Complexidade: Média.

**30. Topic Clustering (LLM)** — E · *Intercom AI Topics*
Métrica: agrupa primeiras mensagens em N tópicos automáticos (ex: "Cancelamento", "Mudança de plano", "Avaliação física").
Valor: descobrir o que o cliente realmente fala — sem depender de tags manuais.
Dados: primeira mensagem de cada conversa + LLM (embedding + cluster).
Complexidade: Alta.

**31. FAQ Misses — perguntas que aparecem mas não estão na FAQ** — E · *Drift*
Métrica: top 30 frases recorrentes do cliente (ngram analysis).
Valor: alimentar base de conhecimento.
Dados: `messages.content` (incoming) + ngram.
Complexidade: Média.

**32. Tags ineficientes (tag X, mas reabre)** — E · *original*
Métrica: tags em conversas que reabrem mais que a média.
Valor: ver quais temas são mais "pegajosos" / mal resolvidos.
Dados: `taggings` × reopen rate.
Complexidade: Média.

**33. Análise de palavras-chave de risco** — E · *Compliance*
Métrica: count de mensagens contendo palavras-chave (ex: "processo", "Procon", "cancelar"), por mês.
Valor: alerta executivo. "Procon" subiu 40% — vai estourar problema.
Dados: full-text search em `messages.content`.
Complexidade: Média.

---

### F. Produtividade / gestão

**34. Tempo médio entre resposta consecutiva do agente** — F · *original*
Métrica: dentro de uma mesma conversa em open, quanto tempo médio entre 2 mensagens do agente.
Valor: detectar conversas "esquecidas" no meio do caminho.
Dados: `messages.created_at` em sequência.
Complexidade: Média.

**35. Notas internas: volume e por quem** — F · *Front Internal Comments*
Métrica: notas privadas (`messages.private=true`) por atendente.
Valor: mede colaboração — atendente que pede ajuda muito (positivo, aprende) ou nunca (preocupante).
Dados: `messages.private=true`.
Complexidade: Baixa.

**36. Mensagens por hora de atividade** — F · *Help Scout Productivity*
Métrica: volume de mensagens enviadas por hora do dia, por atendente.
Valor: identificar perfil de produtividade (quem performa de manhã vs à tarde).
Dados: `messages` outgoing × hora.
Complexidade: Baixa.

**37. Templates / respostas prontas usadas** — F · *Intercom Saved Replies*
Métrica: top templates mais usados, % de mensagens que usaram template.
Valor: padronização. Se 80% das mensagens usam template = consistência. Se 5% = bagunça.
Dados: `messages.content_type` ou `messages.message_type=3`. Investigar.
Complexidade: Média.

**38. Volume de anexos / mídia** — F · *Help Scout Attachment Report*
Métrica: % de conversas com anexos, por inbox, por departamento.
Valor: capacity planning (mídia consome banda).
Dados: `attachments`.
Complexidade: Baixa.

**39. Tempo de "pausa" do atendente** — F · *call center break analysis*
Métrica: gaps na atividade do atendente durante o dia (sem mensagem por 30+ min com conversas em fila).
Valor: identificar quem fica muito tempo offline durante o expediente.
Dados: `messages.created_at` por user.
Complexidade: Média.

---

### G. Negócio / receita

**40. Conversion Rate de Lead → Cliente** — G · *HubSpot Funnel*
Métrica: % de novos contatos que viraram cliente (custom_attribute: "matriculado").
Valor: medir impacto comercial direto do atendimento.
Dados: `contacts.additional_attributes` (preencher campo de status), `conversations.custom_attributes`.
Complexidade: Média.

**41. ROI por canal/inbox** — G · *Gorgias Channel ROI*
Métrica: leads recebidos × leads convertidos × ticket médio (custom_attribute) por inbox.
Valor: justificar investimento em cada canal.
Dados: `conversations` × `inboxes` × custom_attributes.
Complexidade: Média.

**42. Vendas por atendente** — G · *Sales-style ranking*
Métrica: número de leads convertidos por atendente.
Valor: comissionamento, reconhecimento.
Dados: `conversations.assignee_id` × custom_attributes (matrícula).
Complexidade: Baixa.

**43. Funil: Primeira mensagem → Visita agendada → Matrícula** — G · *funil completo*
Métrica: conversion em cada etapa.
Valor: ver onde o lead "morre" no funil.
Dados: `conversations.custom_attributes` (precisa preencher etapa).
Complexidade: Média.

**44. Time-to-first-touch comercial** — G · *Drift Speed-to-Lead*
Métrica: tempo entre criação do lead (primeira mensagem) e primeira resposta de atendente comercial.
Valor: leads abandonados nos primeiros 5 min têm probabilidade muito menor de fechar.
Dados: `conversations.created_at` × primeira `messages` outgoing.
Complexidade: Baixa (já temos parecido na tabela Conversas — agora exposto no relatório).

---

### H. Operacional / real-time

**45. Live Queue Dashboard** — H · *Front Live Dashboard*
Métrica: snapshot ao vivo: conversas em open, em pending, oldest waiting, agentes disponíveis. Auto-refresh 30s ou via SSE.
Valor: gestor abre uma TV no escritório.
Dados: `conversations.status` em tempo real + `users.availability_status`.
Complexidade: Média.

**46. SLA Breach Predictor** — H · *Zendesk SLA*
Métrica: lista de conversas que vão estourar SLA nas próximas 30/60/90 min, ordenadas.
Valor: priorizar antes de quebrar.
Dados: `conversations.created_at` + SLA configurado (precisa).
Complexidade: Média.

**47. Top 10 conversas mais antigas em aberto (hot list)** — H · *original*
Métrica: lista priorizada por idade da conversa em open + sem resposta há.
Valor: ataque das mais antigas / risco maior.
Dados: já temos via mensagens-nao-respondidas.
Complexidade: Baixa (variação do existente).

**48. Alerta de "hot inbox"** — H · *original*
Métrica: inbox com volume súbito (> 2σ da média horária) — push notification.
Valor: alertar problema de canal específico (ex: WhatsApp da unidade X explodiu).
Dados: `conversations.created_at` × `inbox_id`.
Complexidade: Média.

---

### I. Compliance / governança

**49. Mensagens fora do horário comercial** — I · *Front Out-of-Hours*
Métrica: % de mensagens outgoing enviadas fora do horário (configurável, ex: 8-22h).
Valor: política de tom + qualidade de vida do atendente.
Dados: `messages.created_at` × hora.
Complexidade: Baixa.

**50. Auditoria de tom (palavras proibidas)** — I · *Observe.AI Compliance*
Métrica: alerta de mensagens contendo lista de termos proibidos (palavrão, gíria, frases negativas).
Valor: padrão de comunicação da Matrix.
Dados: full-text + lista configurável.
Complexidade: Média.

**51. Conversas sem nota / sem tag** — I · *Help Scout Audit*
Métrica: % de resolved sem nenhuma tag aplicada ou nenhuma nota.
Valor: governança. Toda conversa relevante deveria ter classificação.
Dados: `conversations` × `taggings` × `notes`.
Complexidade: Baixa.

---

### J. Predição / IA (Agente Nex)

**52. Detector de churn de cliente** — J · *Mixpanel Churn / Intercom Predictive*
Métrica: contatos que tinham frequência X de interação e zeraram nos últimos 30 dias.
Valor: lista para atendimento proativo.
Dados: `contacts.id` × histórico de `conversations.created_at`.
Complexidade: Média.

---

## 4. Top 15 priorizados (recomendação para discussão)

Critério: **alto impacto operacional × baixo/médio custo de implementação × dados já disponíveis**.

| Rank | Relatório | Categoria | Por que |
|------|-----------|-----------|---------|
| 1 | **Pulse semanal comparativo** (#3) | A | Visão executiva instantânea — pega tudo que importa em 1 tela |
| 2 | **First Contact Resolution** (#7) | B | Indicador #1 de qualidade real |
| 3 | **Reopen Rate** (#8) | B | Detecta atendimento empurrado |
| 4 | **Forecast 7 dias** (#1) | A | Dimensiona escala antes do problema |
| 5 | **Detector de anomalia diária** (#2) | A | Reage rápido a picos atípicos |
| 6 | **Top tags com evolução** (#28) | E | Descobre temas emergentes |
| 7 | **Score 360° do atendente** (#12) | B | Ranking justo, não enviesado |
| 8 | **Live Queue Dashboard** (#45) | H | TV operacional para o gestor |
| 9 | **Customer Health Score** (#25) | D | Atendimento proativo de risco |
| 10 | **Funil de conversão Lead→Matrícula** (#43) | G | Liga atendimento à receita |
| 11 | **Topic Clustering com Nex IA** (#30) | E | Diferencial: clustering automático sem depender de tags |
| 12 | **Sentimento via Nex IA** (#24) | D | Detectar conversas em risco |
| 13 | **Cohort de retorno** (#26) | D | Engajamento real ao longo do tempo |
| 14 | **Mensagens fora do horário** (#49) | I | Compliance + qualidade de vida |
| 15 | **Heatmap "horário ofensivo"** (#4) | A | Cruza volume × performance |

---

## 5. Próximos passos sugeridos

1. **Você escolhe entre 3 e 8 desses relatórios** para virar a próxima release (v0.8.0).
2. Eu escrevo a **spec v1 → v2 → v3** com double-check para cada relatório selecionado.
3. **Pré-condições que talvez precisem ser resolvidas antes:**
   - **CSAT** (#21, #22) — verificar se `csat_survey_responses` está povoado no banco. Se não, ativar pesquisa no Chatwoot.
   - **Funil/Negócio** (#40-43) — definir quais `custom_attributes` em `conversations` ou `contacts` sinalizam "matriculado", "visita agendada", etc. Pode exigir alinhamento de campos com a equipe.
   - **SLA** (#46) — definir SLAs (ex: 5 min de FRT em horário comercial, 30 min fora). Hoje não há SLA configurado.
   - **Topic clustering / Sentimento** (#30, #24) — usar o Agente Nex (já temos infra LLM). Custo de tokens é o ponto a calibrar.

---

## 6. Insights extras (pensando fora da caixa)

- **"Whisper coaching"** — gestor vê em real-time que uma conversa específica está virando ruim (sentimento negativo + tempo crescendo) e pode "cochichar" pro atendente uma sugestão. Inspiração: Cresta. Complexidade: Alta, mas é diferenciador.
- **"Recompensa por excelência"** — ranking gamificado mensal: top 3 atendentes ganham reconhecimento automático no dashboard.
- **"Conversas que merecem revisão"** — fila para o gestor revisar: conversas com CSAT baixo, ou com palavras-chave de risco, ou com tempo de resolução muito acima da média.
- **"Mapa de leads por unidade da Matrix"** — se cada inbox é uma unidade, mapa do Brasil mostrando volume e conversão por estado (a coluna "Estado" já existe na tabela Conversas).
- **"Tempo do cliente esperando" vs "tempo do atendente trabalhando"** — comparativo brutal: cliente esperou 3h, atendente trabalhou 2 min.

---

## 7. Aval do João — qual rumo seguimos?

Cite os números das ideias que quer ir adiante (ex: "1, 2, 3, 7, 8, 28, 45") ou descreva qual ângulo prefere atacar primeiro:
- **Mais qualidade individual** (ranking justo, FCR, reopen, score 360°)?
- **Mais visão executiva** (pulse, forecast, anomalia)?
- **Mais negócio** (funil, ROI, leads convertidos)?
- **Mais IA** (topic clustering, sentimento, churn predictor)?
- **Mais operacional** (live dashboard, SLA breach, hot inbox)?

Com seu sinal, parto para a spec v1→v2→v3 da próxima release.
