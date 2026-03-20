# Checklist Pre-Deploy — Hostinger

Use esta lista antes de fazer o deploy ou apos qualquer atualizacao.

---

## Codigo e Build

- [ ] `npm run build` roda sem erros localmente
- [ ] Pasta `dist/` gerada com `server.js` e demais arquivos
- [ ] Nenhum `console.log` com dados sensiveis no codigo

## Repositorio GitHub

- [ ] Repositorio criado (privado recomendado)
- [ ] Todos os arquivos commitados e pushed
- [ ] `.env` e `.env.save` NAO estao no repositorio (confirmado pelo .gitignore)
- [ ] `BACKEND_BASE/` com os 4 JSONs esta dentro do repositorio

## Base de contexto (BACKEND_BASE)

- [ ] `catalogo_produtos.json` — categorias e produtos preenchidos
- [ ] `regras_frete.json` — zonas e cidades corretas
- [ ] `faq.json` — perguntas e respostas atualizadas
- [ ] `regras_negocio.json` — regras de parcelamento, PIX, etc.

## Configuracao .env no servidor

- [ ] `PORT` definido (ex: 3100)
- [ ] `HOST=0.0.0.0`
- [ ] `CONTEXT_BASE_PATH=./BACKEND_BASE` (default, nao precisa mudar)
- [ ] `OPENAI_API_KEY` preenchida com chave valida
- [ ] `OPENAI_TEXT_MODEL=gpt-4o-mini`
- [ ] `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`
- [ ] `WEBHOOK_SECRET` definido com valor forte (min 32 caracteres)
- [ ] `NODE_ENV=production`

## Painel Hostinger

- [ ] Subdominio `api.evaplace.com.br` criado
- [ ] SSL ativo para o subdominio
- [ ] Node.js App configurado:
  - [ ] Node version >= 18
  - [ ] Application root: raiz do repositorio importado
  - [ ] Startup file: `dist/server.js`
- [ ] `npm install` executado no servidor
- [ ] `npm run build` executado no servidor
- [ ] App iniciado/reiniciado

## Validacao pos-deploy

- [ ] `curl https://api.evaplace.com.br/health` retorna `{"status":"ok",...}`
- [ ] Teste com payload de texto via curl funciona
- [ ] ManyChat External Request configurado com URL e secret corretos
- [ ] Teste real via WhatsApp: mensagem enviada e resposta recebida

## ManyChat

- [ ] URL do External Request: `https://api.evaplace.com.br/webhooks/manychat/inbound`
- [ ] Header `X-Webhook-Secret` com mesmo valor do `.env` do servidor
- [ ] Header `Content-Type: application/json`
- [ ] Body com campos: id, full_name, whatsapp_phone, last_input_text, last_input_audio, last_input_image
- [ ] Response mapping: campo `reply` mapeado para resposta
