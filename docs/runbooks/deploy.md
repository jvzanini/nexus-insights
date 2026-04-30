# Runbook — Deploy Nexus Insights

## Resumo

Push em `main` → GitHub Actions (`.github/workflows/build.yml`):
1. **build** — builda a imagem Docker e pusha para `ghcr.io/jvzanini/nexus-insights:latest`.
2. **deploy** — chama Portainer API para puxar a imagem nova no nó Swarm e força redeploy do service `nexus-insights_app` via `TaskTemplate.ForceUpdate++`.

Sem ação manual em produção.

## Pré-requisitos (configurados uma vez)

### Secrets no repositório `jvzanini/nexus-insights`
- `PORTAINER_URL` — base do Portainer (ex: `https://portainer.exemplo.com`).
- `PORTAINER_TOKEN` — API Key do Portainer (X-API-Key) com escrita em endpoints/services.
- `PORTAINER_ENDPOINT_ID` — ID do endpoint Swarm no Portainer (geralmente `1`).
- `PORTAINER_STACK_ID` — ID do stack `nexus-insights` no Portainer.
- `GHCR_TOKEN` — **PAT GitHub com `read:packages`** (autenticação para o Swarm pull).

### Visibilidade da imagem GHCR
A imagem `ghcr.io/jvzanini/nexus-insights` precisa ser **pública** OU o `GHCR_TOKEN` precisa ter `read:packages`. Sem isso, o passo de pull retorna HTTP 403 e o Swarm faz ForceUpdate usando a imagem cached localmente (a versão antiga).

**Recomendado:** deixar pública (Settings → Packages → nexus-insights → Change visibility). A imagem só contém o build do app — sem credenciais.

## Fluxo automático (uma push em main)

```
push main
  └─> Actions run "Build and Push"
        ├─ build job
        │   ├─ docker login ghcr.io
        │   ├─ docker buildx build + push :latest e :sha-XXXX
        │   └─ ~2 min
        └─ deploy job (depende de build)
            ├─ POST .../docker/images/create?fromImage=ghcr.io/jvzanini/nexus-insights&tag=latest
            │   (com X-Registry-Auth: base64(GHCR_TOKEN))
            ├─ GET  .../docker/services → encontra `nexus-insights_app`
            ├─ POST .../docker/services/{id}/update?version=N
            │   body: spec do service com TaskTemplate.ForceUpdate++
            └─ Swarm reagenda task → pega imagem :latest atualizada → container novo
```

Tempo total ≈ 3–5 min do push até o container novo no ar.

## Verificação após deploy

```bash
curl -s https://insights.nexusai360.com/api/health | jq .
# {"status":"ok","checks":{"database":...,"redis":...,"chatwoot":...}}

curl -s https://insights.nexusai360.com/login | grep -o "Relatórios [^<]*"
# Deve refletir a tagline da release (ex: v0.7.0+ → "Relatórios Inteligentes").
```

## Troubleshooting

### Pull image: HTTP 403
**Causa:** `GHCR_TOKEN` sem `read:packages` ou imagem privada.
**Fix:** tornar a imagem pública OU regerar o PAT com `read:packages` e atualizar o secret.

### Service update: HTTP 405
**Causa:** workflow tentando endpoint errado para o tipo de stack.
**Fix:** stacks Swarm não git-managed precisam usar **`/docker/services/{id}/update?version=N`** com `ForceUpdate++` no spec — NÃO `/api/stacks/{id}/git/redeploy` (que é só para stacks git-managed). O workflow atual já está correto.

### Service não encontrado
**Causa:** nome do service diferente de `{stack}_app`. Em Swarm + Portainer com compose, services nascem como `{stack}_{service}`. Se o `docker-compose.production.yml` tem `services: { app: ... }` o nome é `nexus-insights_app`.
**Fix:** ajustar `SERVICE_NAME` no workflow.

### Container novo no ar mas sem mudança visível
**Causa:** ForceUpdate disparou mas Swarm usou imagem cached local (porque o pull falhou).
**Sintomas:** `Service update: HTTP 200` mas tagline/health mostra versão antiga.
**Fix:** verifique `Pull image: HTTP` nos logs do deploy. Se 403, ver "Pull image: HTTP 403" acima.

### Redeploy manual (último recurso)
Portainer UI → Stacks → `nexus-insights` → "Update the stack" → marque "Re-pull image and redeploy" → confirme.

## Histórico de incidentes

- **2026-04-29 (v0.7.0):** workflow original usava `/api/stacks/{id}/git/redeploy` (HTTP 405) — substituído por Swarm-aware `Pull + ForceUpdate++` (mesmo padrão do Roteador Webhook Meta).
