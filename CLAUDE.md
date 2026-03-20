# CLAUDE.md — EVA PLACE Backend

## Sobre o projeto

Backend de atendimento automatizado para a EVA PLACE (Fortaleza/CE).
Recebe webhooks do ManyChat (WhatsApp), processa com matchers locais e OpenAI, responde ao cliente.

## Stack

- Node.js + TypeScript
- Fastify (HTTP server)
- OpenAI SDK (gpt-4o-mini para texto/imagem, gpt-4o-mini-transcribe para audio)
- dotenv para variaveis de ambiente

## Comandos

```bash
npm run dev        # Rodar localmente com hot reload
npm run build      # Compilar TypeScript -> dist/
npm run start      # Rodar versao compilada (producao)
```

## Estrutura

- `src/` — codigo TypeScript
- `BACKEND_BASE/` — JSONs de contexto (catalogo, frete, FAQ, regras)
- `ops/` — documentacao de deploy
- `examples/` — payloads de teste

## Convencoes

- Matchers locais primeiro, OpenAI segundo, fallback humano terceiro
- CONTEXT_BASE_PATH default: `./BACKEND_BASE` (interno ao repo)
- Startup file para producao: `dist/server.js`
- Deploy via GitHub import na Hostinger (subdominio api.evaplace.com.br)
- `.env` nunca vai para o repositorio
