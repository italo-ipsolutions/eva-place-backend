# CLAUDE.md — EVA PLACE Backend

## Sobre o projeto

Backend de atendimento automatizado para a EVA PLACE (Fortaleza/CE).
Recebe webhooks do ManyChat (WhatsApp), processa com matchers locais e OpenAI, responde ao cliente.

## Fonte de verdade

- **Precos, cores, estoque, variantes:** WooCommerce REST API (sincronizado via `npm run sync:catalog`)
- **Regras de negocio (frete, parcelamento, persona, argumentacao):** JSONs locais em `BACKEND_BASE/`
- **NAO usar precos hardcoded ou legados do Prompt Mestre/Bling.** Tudo vem do WooCommerce.
- `BACKEND_BASE/catalogo_produtos.json` e GERADO pelo script — NAO editar manualmente.

## Stack

- Node.js + TypeScript
- Fastify (HTTP server)
- OpenAI SDK (gpt-4o-mini para texto/imagem, gpt-4o-mini-transcribe para audio)
- WooCommerce REST API v3 (fonte de catalogo)
- dotenv para variaveis de ambiente

## Comandos

```bash
npm run dev            # Rodar localmente com hot reload
npm run build          # Compilar TypeScript -> dist/
npm run start          # Rodar versao compilada (producao)
npm run sync:catalog   # Sincronizar catalogo do WooCommerce (FONTE OFICIAL)
npm run sync:catalog:diff  # Ver diferencas vs catalogo atual + salvar
npm run sync:catalog:dry   # Simular sem salvar
```

## Estrutura

- `src/` — codigo TypeScript
- `src/lib/woocommerce.ts` — cliente HTTP da API WooCommerce
- `scripts/sync-catalog.ts` — sincronizacao WooCommerce → catalogo
- `BACKEND_BASE/` — JSONs de contexto (catalogo GERADO, frete, FAQ, regras)
- `ops/` — documentacao de deploy e integracao
- `examples/` — payloads de teste

## Convencoes

- **Rota principal:** `/webhooks/whatsapp` (WhatsApp Cloud API — integracao direta, sem ManyChat)
- **Rota ManyChat:** `/webhooks/manychat/dynamic` (Dynamic Block — fallback se ainda usar ManyChat)
- **Rota legada:** `/webhooks/manychat/inbound` (External Request — NAO usar)
- Matchers locais primeiro, OpenAI segundo, fallback humano terceiro
- WhatsApp Cloud API: backend recebe + responde direto (sem intermediario)
- CONTEXT_BASE_PATH default: `./BACKEND_BASE` (interno ao repo)
- Startup file para producao: `dist/server.js`
- Deploy via GitHub import na Hostinger (subdominio api.evaplace.com.br)
- `.env` nunca vai para o repositorio
- Precos SEMPRE do `catalogo_produtos.json` (gerado do WooCommerce)
- FAQ e regras de negocio NAO devem conter precos (risco de desatualizacao)
