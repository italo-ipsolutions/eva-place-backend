# WhatsApp Cloud API — Guia de Configuracao

## Visao geral

O backend da EVA PLACE agora suporta integracao DIRETA com a WhatsApp Cloud API da Meta,
sem depender do ManyChat. O backend recebe webhooks da Meta, processa com o mesmo pipeline
de atendimento (catalogo, frete, FAQ, OpenAI), e responde diretamente pela API.

## Fluxo

```
Cliente envia mensagem no WhatsApp
  |
  v
Meta envia webhook POST para o backend
  POST https://api.evaplace.com.br/webhooks/whatsapp
  |
  v
Backend:
  1. Parse do payload Meta (texto, audio, imagem)
  2. Marca como lida (blue ticks)
  3. Pipeline: intent -> matchers -> OpenAI -> fallback
  4. Envia resposta via WhatsApp Cloud API
  |
  v
Cliente recebe resposta no WhatsApp (direto, sem ManyChat)
```

## Pre-requisitos

1. **Meta Business Account** verificada
2. **WhatsApp Business App** criada no Meta for Developers
3. **Numero de telefone** registrado no WhatsApp Business Platform
4. **Permanent Access Token** (ou System User Token)

## Passo a passo

### 1. Criar App no Meta for Developers

1. Ir para https://developers.facebook.com/apps/
2. Criar novo app > Tipo: **Business**
3. Adicionar produto: **WhatsApp**
4. Anotar o **Phone Number ID** e **WhatsApp Business Account ID**

### 2. Gerar Access Token

**Opcao A: Token temporario (testes)**
- No painel WhatsApp > API Setup > clique em "Generate Token"
- Valido por 24h — bom para testar

**Opcao B: Token permanente (producao)**
1. Criar System User em Business Settings > System Users
2. Adicionar o app e dar permissao `whatsapp_business_messaging`
3. Gerar token permanente para o System User
4. Esse token nao expira

### 3. Configurar variaveis de ambiente no servidor

Adicionar ao `.env` na Hostinger (ou localmente):

```env
# WhatsApp Cloud API (Meta)
META_WHATSAPP_VERIFY_TOKEN=um_token_secreto_qualquer_que_voce_inventa
META_WHATSAPP_ACCESS_TOKEN=EAA...token_da_meta...
META_WHATSAPP_PHONE_NUMBER_ID=123456789012345
META_WHATSAPP_API_VERSION=v21.0
```

O `META_WHATSAPP_VERIFY_TOKEN` e um valor que VOCE escolhe. Sera usado
na etapa de verificacao do webhook na Meta. Pode ser qualquer string segura.

### 4. Configurar webhook na Meta

1. No painel Meta for Developers > WhatsApp > Configuration
2. **Callback URL:** `https://api.evaplace.com.br/webhooks/whatsapp`
3. **Verify Token:** o mesmo valor de `META_WHATSAPP_VERIFY_TOKEN` do `.env`
4. Clicar **Verify and Save**
5. A Meta faz um GET com `hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE`
6. O backend responde com o challenge — verificacao completa

### 5. Assinar campos do webhook

Apos verificacao, marcar para receber:
- [x] **messages** — mensagens recebidas (texto, audio, imagem, etc)

Opcional:
- [ ] message_template_status_update
- [ ] account_update

### 6. Testar

Enviar uma mensagem para o numero WhatsApp Business registrado.
Verificar nos logs do servidor:

```
whatsapp_meta_webhook_raw { object: "whatsapp_business_account" }
meta_parser_message { from: "5585...", type: "text" }
inbound { subscriber_id: "wa_5585...", type: "text", message: "..." }
outbound { subscriber_id: "wa_5585...", intent: "...", source: "..." }
whatsapp_meta_send_ok { to: "5585...", message_id: "wamid.xxx" }
```

## Variaveis de ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `META_WHATSAPP_VERIFY_TOKEN` | Sim | Token de verificacao do webhook (voce escolhe) |
| `META_WHATSAPP_ACCESS_TOKEN` | Sim | Access Token da API WhatsApp (Meta for Developers) |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Sim | ID do numero de telefone (painel Meta) |
| `META_WHATSAPP_API_VERSION` | Nao | Versao da API (default: v21.0) |

## Endpoints

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/webhooks/whatsapp` | Verificacao do webhook (Meta challenge) |
| POST | `/webhooks/whatsapp` | Receber mensagens + processar + responder |

## Diferenca vs ManyChat

| Aspecto | ManyChat | WhatsApp Cloud API |
|---------|----------|--------------------|
| Intermediario | ManyChat (SaaS) | Nenhum — direto |
| Custo | Plano ManyChat | Apenas custo Meta por conversa |
| Latencia | +1 hop (ManyChat → backend → ManyChat → WhatsApp) | Backend → WhatsApp direto |
| Custom fields | Causa contaminacao/atraso 1 turno | Nao existe — sem esse problema |
| Controle | Limitado ao que ManyChat permite | Total — o backend e o orquestrador |
| Dependencia | ManyChat pode mudar API/precos | API oficial estavel da Meta |

## Solucao de problemas

### Webhook nao verifica
- Confirmar que `META_WHATSAPP_VERIFY_TOKEN` no `.env` e IDENTICO ao configurado na Meta
- Confirmar que o servidor esta acessivel publicamente (HTTPS)
- Testar manualmente: `curl "https://api.evaplace.com.br/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste123"`

### Mensagem nao chega ao backend
- Verificar que o campo "messages" esta assinado na configuracao do webhook
- Verificar logs do servidor para erros de parse

### Resposta nao chega ao cliente
- Verificar `META_WHATSAPP_ACCESS_TOKEN` (pode ter expirado se for temporario)
- Verificar `META_WHATSAPP_PHONE_NUMBER_ID`
- Verificar logs: `whatsapp_meta_send_error`

### Media (audio/imagem) nao funciona
- O download de midia requer o access token — confirmar que esta valido
- Verificar logs: `whatsapp_meta_media_url_error`
