# Diagnostico — Base de Precos do Backend EVA PLACE

**Data:** 2026-03-20
**Objetivo:** Comparar precos atuais do backend com precos reais praticados (Bling 90 dias)

---

## 1. Fonte atual da base do backend

O arquivo `BACKEND_BASE/catalogo_produtos.json` foi criado a partir do **Prompt Mestre Consolidado** (documento Google Docs).

- **Data de extracao:** 2026-03-18
- **Fonte:** `00_PROMPT_MESTRE_CONSOLIDADO`
- **Problema:** O Prompt Mestre pode conter precos antigos, desatualizados ou aproximados.

---

## 2. Divergencias encontradas (Backend vs Bling real)

### Tatame 50x50cm — 10mm

| Campo | Backend | Real (Bling) | Status |
|-------|---------|--------------|--------|
| Avulso | R$ 12,00 | R$ 11,00 - R$ 12,00 | ⚠️ WooCommerce pratica R$ 11 |
| Kit 12 | R$ 126,00 | R$ 120,00 | ❌ ERRADO (-R$ 6) |
| Kit 9 | R$ 97,20 | R$ 90,00 | ❌ ERRADO (-R$ 7,20) |

### Tatame 50x50cm — 15mm

| Campo | Backend | Real (Bling) | Status |
|-------|---------|--------------|--------|
| Avulso | R$ 17,00 | R$ 16,90 (Woo) / R$ 10 (direto?!) | ⚠️ Divergente |

### Tatame 50x50cm — 20mm

| Campo | Backend | Real (Bling) | Status |
|-------|---------|--------------|--------|
| Avulso | R$ 22,00 | R$ 21,00 (Woo) / R$ 22,00 (direto) | ⚠️ WooCommerce pratica R$ 21 |
| Marca NB | nao distingue | R$ 14,00 | ❌ FALTA MARCA |
| Marca MX | nao distingue | R$ 22,00 | ❌ FALTA MARCA |

### Tatame 100x100cm (1x1m) — 10mm

| Campo | Backend | Real (Bling) | Status |
|-------|---------|--------------|--------|
| Preco | R$ 35,00 | R$ 25 / R$ 35 / R$ 39,90 | ⚠️ Multiplos precos |

### Tatame 100x100cm (1x1m) — 20mm

| Campo | Backend | Real (Bling) | Status |
|-------|---------|--------------|--------|
| Preco | R$ 70,00 | R$ 65,00 | ❌ ERRADO (+R$ 5) |

### Cores faltando no backend (mas vendidas na pratica)

- Verde Militar
- Beringela
- Salmon
- Verde Agua
- Cinza
- Rosa Pink

### Marcas/Linhas nao distinguidas

O backend trata tudo como produto unico, mas o Bling mostra duas linhas:
- **NB** (Numeros Baixos) — precos mais baixos (ex: 50x50 20mm = R$ 14)
- **MX / MAX** — precos padrao (ex: 50x50 20mm = R$ 22)

---

## 3. Conclusao

> **A base do backend esta desatualizada e incompleta.**
> O bot pode estar informando precos ACIMA do real (tatame 1x1m 20mm: R$ 70 vs R$ 65)
> e precos de kit ACIMA do praticado (Kit 12 10mm: R$ 126 vs R$ 120).

---

## 4. Fonte de verdade recomendada

### Opcao A — WooCommerce REST API (RECOMENDADA)

O site da EVA PLACE roda WooCommerce. A REST API permite:
- Listar todos os produtos ativos com precos atuais
- Obter variacoes (cor, espessura)
- Verificar estoque (se configurado)
- Atualizar automaticamente

**Endpoint:** `https://evaplace.com.br/wp-json/wc/v3/products`
**Autenticacao:** Consumer Key + Consumer Secret (gerar no painel WooCommerce)

### Opcao B — Google Sheets "PRODUTOS ATIVOS"

Existe `MATERIAIS/DOCUMENTOS/PRODUTOS ATIVOS.gsheet` que pode ter dados atualizados.
Requer exportar como CSV e processar.

### Opcao C — Bling API (ja integrada)

Ja ha scripts de extracao da API Bling (`SITE/ANALISE_DADOS/BLING_API_AUDITORIA/`).
Porem Bling tem dados de VENDAS, nao de CATALOGO de produtos ativos.
Pode complementar, mas nao substituir.

---

## 5. Plano de acao

### Fase 1 — Corrigir imediatamente (manual)
1. Exportar `PRODUTOS ATIVOS.gsheet` como CSV
2. Comparar com `catalogo_produtos.json`
3. Corrigir precos, cores e marcas divergentes
4. Push para main → redeploy

### Fase 2 — Automatizar via WooCommerce API
1. Gerar Consumer Key/Secret no painel WooCommerce
2. Criar script `sync-catalog.ts` que puxa produtos da API
3. Gerar `catalogo_produtos.json` atualizado automaticamente
4. Rodar periodicamente ou sob demanda

### Fase 3 — Validar com dono
1. Confirmar se WooCommerce e a fonte de verdade real
2. Confirmar se existem precos diferenciados WhatsApp vs Site
3. Confirmar se as marcas NB/MX devem ser mostradas ao cliente ou nao
