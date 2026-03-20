# EVA PLACE Backend

Backend de atendimento automatizado da EVA PLACE via WhatsApp.
Matchers locais + OpenAI + memoria curta por lead.
**Catalogo sincronizado do WooCommerce** (fonte oficial de precos/cores/estoque).

**Repositorio pronto para deploy na Hostinger via GitHub import.**
Subdominio: `api.evaplace.com.br`

## Arquitetura

```
                      ┌──────────────────────────────────────┐
                      │          WhatsApp do Cliente          │
                      └──────────────┬───────────────────────┘
                                     │
               ┌─────────────────────┼─────────────────────┐
               │                     │                     │
     ┌─────────▼─────────┐ ┌────────▼────────┐  ┌─────────▼─────────┐
     │ WhatsApp Cloud API │ │ ManyChat Dynamic│  │ ManyChat External │
     │ (RECOMENDADO)      │ │ Block           │  │ Request (LEGADO)  │
     │ GET+POST           │ │ POST            │  │ POST              │
     │ /webhooks/whatsapp │ │ /webhooks/      │  │ /webhooks/        │
     │                    │ │ manychat/dynamic│  │ manychat/inbound  │
     └─────────┬──────────┘ └────────┬────────┘  └─────────┬─────────┘
               │                     │                     │
               └─────────────────────┼─────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │      Pipeline       │
                          │  1. Intent detect   │
                          │  2. Frete matcher   │
                          │  3. FAQ matcher     │
                          │  4. Catalogo        │
                          │  5. OpenAI (GPT)    │
                          │  6. Fallback        │
                          │  + Memoria por lead │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │     Resposta        │
                          │  WhatsApp Cloud:    │
                          │    API envia direto │
                          │  ManyChat Dynamic:  │
                          │    Block v2 format  │
                          │  ManyChat External: │
                          │    backend_reply    │
                          └─────────────────────┘
```

## Estrutura do repositorio

```
EVA_PLACE_BACKEND_REPO/
  package.json               # Dependencias e scripts
  tsconfig.json              # Config TypeScript
  .env.example               # Modelo de variaveis de ambiente
  .gitignore                 # Ignora node_modules, dist, .env
  README.md                  # Este arquivo
  BACKEND_BASE/              # Base de contexto (JSONs)
    catalogo_produtos.json
    regras_frete.json
    faq.json
    regras_negocio.json
    campos_tags_manychat.json
  src/                       # Codigo-fonte TypeScript
    server.ts                # Ponto de entrada
    routes/
      health.ts              # GET /health
      whatsapp-meta.ts       # GET+POST /webhooks/whatsapp (WhatsApp Cloud API — RECOMENDADO)
      manychat-dynamic.ts    # POST /webhooks/manychat/dynamic (ManyChat Dynamic Block)
      manychat.ts            # POST /webhooks/manychat/inbound (ManyChat legado)
    lib/
      whatsapp-meta-client.ts  # Envio de mensagens via WhatsApp Cloud API
      whatsapp-meta-parser.ts  # Parse de webhooks da Meta
      auth.ts                # Validacao webhook secret (ManyChat)
      manychat-parser.ts     # Normaliza payload ManyChat
      memory.ts              # Memoria curta in-memory por lead
      logger.ts              # Logger JSON estruturado
      context-loader.ts      # Carrega JSONs de BACKEND_BASE
      catalog.ts             # Busca e resposta de produtos
      frete.ts               # Calculo de frete e zonas
      faq.ts                 # Match de perguntas frequentes
      rules.ts               # OpenAI texto + fallback humano
      openai-client.ts       # Singleton OpenAI
      prompt-builder.ts      # System prompt + historico
      media.ts               # Transcricao audio + analise imagem
    types/
      index.ts               # Tipagens TypeScript
  examples/                  # Payloads de teste
  ops/                       # Documentacao de deploy
    hostinger-deploy.md      # Guia passo a passo
    hostinger-checklist.md   # Checklist pre-deploy
```

## Como rodar localmente

```bash
npm install
cp .env.example .env
# Editar .env: preencher OPENAI_API_KEY e WEBHOOK_SECRET
npm run dev
```

## Testar localmente

```bash
# Health
curl -s http://localhost:3100/health | jq .

# Payload texto
curl -s -X POST http://localhost:3100/webhooks/manychat/inbound \
  -H "Content-Type: application/json" \
  -d @examples/payload_manychat_real_texto.json | jq .

# Com autenticacao
curl -s -X POST http://localhost:3100/webhooks/manychat/inbound \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: SEU_SECRET" \
  -d @examples/payload_manychat_real_texto.json | jq .
```

## Variaveis de ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `PORT` | Nao | Porta do servidor (default: 3100) |
| `HOST` | Nao | Host de bind (default: 0.0.0.0) |
| `CONTEXT_BASE_PATH` | Nao | Caminho para BACKEND_BASE (default: ./BACKEND_BASE) |
| `OPENAI_API_KEY` | Sim | Chave da OpenAI |
| `OPENAI_TEXT_MODEL` | Nao | Modelo de texto (default: gpt-4o-mini) |
| `OPENAI_TRANSCRIBE_MODEL` | Nao | Modelo de transcricao (default: gpt-4o-mini-transcribe) |
| `WEBHOOK_SECRET` | Sim (ManyChat) | Secret de autenticacao do webhook ManyChat |
| `META_WHATSAPP_VERIFY_TOKEN` | Sim (Meta) | Token de verificacao do webhook (voce escolhe) |
| `META_WHATSAPP_ACCESS_TOKEN` | Sim (Meta) | Access Token da API WhatsApp |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Sim (Meta) | Phone Number ID do painel Meta |
| `META_WHATSAPP_API_VERSION` | Nao | Versao da API Meta (default: v21.0) |
| `WOOCOMMERCE_BASE_URL` | Sim (sync) | URL base do WooCommerce (ex: https://evaplace.com.br) |
| `WOOCOMMERCE_CONSUMER_KEY` | Sim (sync) | Consumer Key da REST API |
| `WOOCOMMERCE_CONSUMER_SECRET` | Sim (sync) | Consumer Secret da REST API |
| `NODE_ENV` | Nao | production ou development |

## Sincronizacao WooCommerce (fonte de verdade)

O catalogo de produtos (`BACKEND_BASE/catalogo_produtos.json`) e gerado automaticamente
a partir do WooCommerce REST API. **WooCommerce e a unica fonte oficial de precos, cores e estoque.**

```bash
# Sincronizar catalogo (puxa do WooCommerce e salva)
npm run sync:catalog

# Ver diferencas antes de salvar
npm run sync:catalog:diff

# Simular sem salvar
npm run sync:catalog:dry
```

> **NAO editar `catalogo_produtos.json` manualmente.** Sempre rodar `npm run sync:catalog`.
> Documentacao completa: `ops/woocommerce-sync.md`

## Deploy na Hostinger (via GitHub)

O deploy e feito importando este repositorio GitHub diretamente no painel da Hostinger.

### Resumo do fluxo

1. Push deste repo para GitHub (privado)
2. Hostinger > Node.js > Create Application > Import from GitHub
3. Configurar no painel:
   - **Node version:** 18+ (recomendado 20)
   - **Startup file:** `dist/server.js`
4. Criar `.env` no servidor com as chaves reais
5. Rodar `npm install && npm run build` no terminal
6. Iniciar a aplicacao

### Documentacao completa

- `ops/hostinger-deploy.md` — guia passo a passo
- `ops/hostinger-checklist.md` — checklist pre-deploy

## WhatsApp Cloud API (Meta) — Integracao direta (RECOMENDADO)

> **Este e o modo preferido.** O backend se comunica diretamente com a API
> oficial do WhatsApp, sem intermediario. Sem ManyChat, sem atraso, controle total.

### Resumo

| Rota | Metodo | Funcao |
|------|--------|--------|
| `/webhooks/whatsapp` | GET | Verificacao do webhook (Meta challenge) |
| `/webhooks/whatsapp` | POST | Receber mensagens + processar + responder direto |

### Configurar

1. Criar app no [Meta for Developers](https://developers.facebook.com/apps/)
2. Adicionar produto WhatsApp
3. Gerar Access Token (permanente para producao)
4. Configurar no `.env`:
   ```env
   META_WHATSAPP_VERIFY_TOKEN=um_token_seguro_que_voce_inventa
   META_WHATSAPP_ACCESS_TOKEN=EAA...
   META_WHATSAPP_PHONE_NUMBER_ID=123456789012345
   ```
5. No painel Meta > WhatsApp > Configuration:
   - **Callback URL:** `https://api.evaplace.com.br/webhooks/whatsapp`
   - **Verify Token:** mesmo valor de `META_WHATSAPP_VERIFY_TOKEN`
   - Assinar campo: **messages**

### Testar

```bash
# Verificacao do webhook (simula o que a Meta faz)
curl -s "http://localhost:3100/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste123"

# Simular mensagem de texto inbound (sem enviar resposta — access token nao configurado)
curl -s -X POST http://localhost:3100/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d @examples/payload_whatsapp_meta_text.json
```

> Documentacao completa: `ops/whatsapp-cloud-setup.md`

---

## Configurar no ManyChat (pos-deploy) — alternativa

### ✅ Modo recomendado: Dynamic Block (sem atraso)

> **Este e o modo correto.** A resposta do servidor vai direto para o contato.
> Nao usa custom field intermediario. Elimina o atraso de 1 turno.

1. ManyChat > Automation > Flow
2. Adicionar bloco **Dynamic Block** (nao External Request)
3. **URL:** `https://api.evaplace.com.br/webhooks/manychat/dynamic`
4. **Method:** POST
5. **Headers:**
   - `Content-Type: application/json`
   - `X-Webhook-Secret: SEU_SECRET` (mesmo valor do .env no servidor)
6. **Body:** clicar em **Add Full Contact Data** (botao azul no editor)
   - Nao precisa montar JSON manual
   - O ManyChat envia automaticamente todos os campos do contato dentro de `subscriber`
7. **NAO precisa de Response Mapping** — o Dynamic Block envia a resposta direto
8. **NAO precisa de bloco "Send Message" depois** — a mensagem ja vai pro WhatsApp

O servidor retorna:
```json
{
  "version": "v2",
  "content": {
    "type": "whatsapp",
    "messages": [{ "type": "text", "text": "Resposta aqui..." }],
    "actions": [
      { "action": "add_tag", "tag_name": "interesse_tatame" },
      { "action": "set_field_value", "field_name": "eva_debug_source", "value": "catalogo|produto|high" }
    ]
  }
}
```

### ⚠️ Modo legado: External Request (manter por compatibilidade)

> **NAO recomendado.** Causa atraso de 1 turno porque o ManyChat persiste
> `backend_reply` em custom_fields e reenvia na proxima mensagem.

- URL: `https://api.evaplace.com.br/webhooks/manychat/inbound`
- Requer Response Mapping: `backend_reply` -> variavel do flow
- Requer bloco "Send Message {{backend_reply}}" depois do External Request
- **Problema:** custom_fields contaminam a proxima mensagem com a resposta anterior

### Modo alternativo: JSON manual flat (compatibilidade)

Se por algum motivo precisar usar JSON manual no body (funciona em ambas as rotas):

```json
{
  "id": "{{id}}",
  "full_name": "{{full_name}}",
  "whatsapp_phone": "{{whatsapp_phone}}",
  "last_input_text": "{{last_input_text}}",
  "last_input_audio": "{{last_input_audio_url}}",
  "last_input_image": "{{last_input_image_url}}"
}
```

> O parser identifica qual formato veio e normaliza automaticamente.
