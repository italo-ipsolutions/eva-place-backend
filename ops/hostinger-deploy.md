# Deploy na Hostinger — EVA PLACE Backend

Guia passo a passo para deploy via **GitHub import** na Hostinger,
usando o subdominio `api.evaplace.com.br`.

---

## Pre-requisitos

- Plano Hostinger com suporte a **Node.js** (Business ou superior)
- Dominio `evaplace.com.br` configurado na Hostinger
- Repositorio GitHub (privado) com este projeto
- Chave da OpenAI (`OPENAI_API_KEY`) ativa

---

## Passo 1 — Criar repositorio no GitHub

1. Ir em github.com > **New repository**
2. Nome sugerido: `eva-place-backend`
3. Visibilidade: **Private**
4. **NAO** inicializar com README (ja temos)
5. Criar repositorio

No terminal local, dentro da pasta `EVA_PLACE_BACKEND_REPO/`:

```bash
git init
git add .
git commit -m "Initial commit — EVA PLACE Backend MVP"
git branch -M main
git remote add origin git@github.com:SEU_USUARIO/eva-place-backend.git
git push -u origin main
```

---

## Passo 2 — Criar o subdominio na Hostinger

1. Entrar no **hPanel** > **Dominios** > **Subdominios**
2. Criar subdominio: `api.evaplace.com.br`
3. Aguardar propagacao DNS (normalmente poucos minutos)
4. Verificar se o SSL (Let's Encrypt) foi ativado automaticamente
   - Se nao, ativar em **SSL/TLS** > **Instalar** para `api.evaplace.com.br`

---

## Passo 3 — Importar repositorio GitHub na Hostinger

1. No hPanel, ir em **Avancado** > **Node.js** (ou **Website** > **Node.js**)
2. Clicar em **Criar aplicacao** (ou **Create Application**)
3. Escolher **Import from GitHub** e conectar sua conta GitHub
4. Selecionar o repositorio `eva-place-backend`
5. Preencher:
   - **Node.js version:** 18.x ou superior (recomendado 20.x)
   - **Application root:** raiz do repositorio (ou `/domains/api.evaplace.com.br/`)
   - **Application startup file:** `dist/server.js`
6. Salvar

> A Hostinger vai clonar o repositorio automaticamente para o servidor.

---

## Passo 4 — Criar o arquivo .env no servidor

No **File Manager** ou via **SSH**, dentro da pasta raiz do projeto no servidor, criar `.env`:

```env
PORT=3100
HOST=0.0.0.0
CONTEXT_BASE_PATH=./BACKEND_BASE
OPENAI_API_KEY=sk-proj-SUA_CHAVE_AQUI
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
WEBHOOK_SECRET=SEU_SECRET_FORTE_AQUI
NODE_ENV=production
```

> **CONTEXT_BASE_PATH:** como `BACKEND_BASE/` esta dentro do repositorio,
> o default `./BACKEND_BASE` funciona automaticamente. Nao precisa mudar.

> **WEBHOOK_SECRET:** gere um valor forte com `openssl rand -hex 32`
> ou use qualquer gerador de senha longa.

---

## Passo 5 — Instalar dependencias e buildar

No **Terminal virtual** da Hostinger ou via **SSH**:

```bash
cd /home/u.../domains/api.evaplace.com.br/

# Instalar dependencias (incluindo devDependencies para o build)
npm install --production=false

# Buildar TypeScript -> JavaScript
npm run build

# Verificar que dist/ foi criado
ls dist/
```

> Se o hPanel tiver botao **Run NPM Install**, use-o primeiro.
> Depois rode `npm run build` no terminal.

---

## Passo 6 — Iniciar a aplicacao

1. No painel Node.js, clicar **Start** ou **Restart**
2. A Hostinger faz proxy reverso da porta interna para `https://api.evaplace.com.br`

### Verificar se esta funcionando

```bash
curl https://api.evaplace.com.br/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "uptime": 5,
  "context_loaded": true
}
```

---

## Passo 7 — Configurar no ManyChat

1. ManyChat > Automation > seu flow
2. Bloco **External Request**:
   - **URL:** `https://api.evaplace.com.br/webhooks/manychat/inbound`
   - **Method:** POST
   - **Headers:**
     - `Content-Type: application/json`
     - `X-Webhook-Secret: SEU_SECRET_FORTE_AQUI` (mesmo valor do .env)
   - **Body:**
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
3. **Response Mapping:** mapear `reply` para custom field ou resposta

---

## Atualizacoes futuras

Apos fazer alteracoes no codigo:

```bash
# Local: commit e push
git add .
git commit -m "descricao da mudanca"
git push

# Hostinger: pull e rebuild
# Via SSH ou terminal no painel:
cd /home/u.../domains/api.evaplace.com.br/
git pull
npm install --production=false
npm run build
# Reiniciar app no painel Node.js
```

Ou, se a Hostinger tiver **auto-deploy via GitHub webhook**, basta fazer push.

---

## Troubleshooting

### App nao inicia
- Verificar se `dist/server.js` existe (`npm run build`)
- Verificar se `.env` esta na pasta correta
- Verificar logs: painel Node.js ou `cat ~/.pm2/logs/...`

### Erro de contexto
- Verificar se `BACKEND_BASE/` esta na raiz do projeto
- Verificar se os 4 JSONs estao la

### SSL nao funciona
- Ir em SSL/TLS no hPanel e instalar certificado para o subdominio
- Aguardar ate 10 minutos

### Porta recusada
- A Hostinger faz proxy reverso, nao precisa abrir porta
- Se a Hostinger fornecer `PORT` automatica, ela sera usada

### OpenAI nao responde
- Verificar `OPENAI_API_KEY` no `.env`
- Verificar creditos na conta OpenAI
