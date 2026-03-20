# Sincronizacao WooCommerce → Catalogo Backend

**Data:** 2026-03-20
**Status:** Implementado e funcional

---

## Como funciona

O script `scripts/sync-catalog.ts` conecta na API REST v3 do WooCommerce, puxa todos os produtos publicados e suas variacoes, e gera o `BACKEND_BASE/catalogo_produtos.json` que o bot usa.

### Fluxo

```
WooCommerce (evaplace.com.br)
  ↓ REST API v3 (GET /products + /variations)
scripts/sync-catalog.ts
  ↓ transforma na estrutura do backend
BACKEND_BASE/catalogo_produtos.json (v3.0.0)
  ↓ lido pelo backend no startup
Bot responde com precos/cores/estoque atualizados
```

---

## Comandos

```bash
# Sincronizar e salvar (substitui catalogo atual)
npm run sync:catalog

# Ver o que faria sem salvar
npm run sync:catalog:dry

# Ver diferencas vs catalogo atual + salvar
npm run sync:catalog:diff
```

---

## Variaveis de ambiente

```env
WOOCOMMERCE_BASE_URL=https://evaplace.com.br
WOOCOMMERCE_CONSUMER_KEY=ck_...
WOOCOMMERCE_CONSUMER_SECRET=cs_...
```

Ja configuradas no `.env` local. Para producao na Hostinger, configurar as mesmas variaveis no painel.

---

## O que vem do WooCommerce (fonte de verdade)

| Campo | Fonte | Exemplo |
|-------|-------|---------|
| Preco avulso | `product.price` | R$ 11,00 |
| Cores disponiveis | `variation.stock_status == instock` | Azul, Vermelho, ... |
| Cores em falta | `variation.stock_status == outofstock` | Lavanda, Rosa, ... |
| Status do produto | `product.stock_status` | instock / outofstock |
| SKU | `product.sku` | TAT-50x50-10 |
| Nome do produto | `product.name` | Tatame 50x50cm 10mm |
| Categorias WooCommerce | `product.categories` | Brincar & Aprender |
| Atributos (cor, modelo) | `product.attributes` + `variation.attributes` | Cor: Azul |
| ID do produto/variacao | `product.id`, `variation.id` | 2611, 2867 |

## O que continua vindo de regras locais (NAO vem do WooCommerce)

| Campo | Fonte | Exemplo |
|-------|-------|---------|
| Tabela de kits (precos por quantidade) | `KIT_RULES_50x50` em sync-catalog.ts | Kit 12 = 12% desconto |
| Uso recomendado | `BUSINESS_RULES` em sync-catalog.ts | "Bebe, Protecao Termica" |
| Argumento comercial | `BUSINESS_RULES` | "Ideal pra engatinhar" |
| Restricoes | `BUSINESS_RULES` | "NAO recomendado para artes marciais" |
| Frete especial | `BUSINESS_RULES` | "CARRO obrigatorio" |
| Nota de marca | `BUSINESS_RULES` | "Linha NB existe a R$ 25" |
| ID de categoria do bot | `CATEGORY_MAPPINGS` | tatame_50x50 |
| Regras de frete | `regras_frete.json` | Zonas, valores |
| FAQ | `faq.json` | Perguntas frequentes |
| Regras de negocio | `regras_negocio.json` | Parcelamento, desconto pix |

---

## Mapeamento SKU → Categoria do bot

| SKU Pattern | Categoria bot | Tipo |
|-------------|---------------|------|
| `TAT-50x50-*` | tatame_50x50 | tatame com kits |
| `NB-TAT-50x50-*`, `MAX50X50*` | tatame_50x50_nb | tatame NB/MX (ofertas) |
| `TAT-100x100-*`, `NB-TAT-100x100-*` | tatame_1x1m | tatame profissional |
| `EVA-ANI-*`, `EVA-NUM-*`, `TAP-ALF-*`, etc | tapetes_encaixe_kids | kids educativo |
| `EVA-MESV-*`, `EVA-PASSCID-*` | rolos_esteiras | esteiras/rolos |
| `EVA-ALFA-*` | miudezas | letras soltas |
| `EVA-TAB` | cartelas_avulsas | cartelas (variavel) |
| `YOGA-*` | yoga_mat | yoga |
| `CANT-*` | cantoneira | protecao |
| `STEP-*` | step_eva | step exercicio |
| `FLUT-*` | flutuante | piscina |
| `PRN-*` | prancha_natacao | natacao |
| `PROT-PORTA-*` | protetor_porta | seguranca |

---

## Divergencias encontradas (primeira sync)

| Produto | Backend anterior | WooCommerce | Diferenca |
|---------|-----------------|-------------|-----------|
| Tatame 50x50 10mm avulso | R$ 12,00 | **R$ 11,00** | -R$ 1,00 |
| Tatame 50x50 20mm avulso | R$ 22,00 | **R$ 21,00** | -R$ 1,00 |
| Tatame 1x1m 20mm | R$ 65,00 | **R$ 79,90** | +R$ 14,90 |
| Tatame 1x1m 30mm | R$ 109,00 | **R$ 119,90** | +R$ 10,90 |
| Tatame 1x1m 40mm | R$ 145,00 | **R$ 159,90** | +R$ 14,90 |
| Flutuante 2x1m | R$ 239,90 | **R$ 289,90** | +R$ 50,00 |

### NOTA IMPORTANTE sobre divergencia 1x1m

Os precos do Bling (vendas diretas WhatsApp) eram MENORES que os do WooCommerce.
Isso pode significar:
1. Preco WhatsApp e diferente (negociado) do preco site
2. O WooCommerce tem precos de tabela e o WhatsApp pratica desconto
3. Os precos Bling eram antigos

**Decisao:** O WooCommerce e agora a fonte de verdade. Se o dono praticar precos diferentes no WhatsApp, deve ajustar as regras de negocio locais (BUSINESS_RULES no sync-catalog.ts) ou criar um campo `preco_whatsapp` separado.

---

## Nova categoria: tatame_50x50_nb

O WooCommerce tem linhas NB e MX como produtos separados na categoria "Ofertas".
O sync cria a categoria `tatame_50x50_nb` para esses produtos.

O bot atualmente NAO exibe NB/MX proativamente — mostra preco padrao.
Para mudar, ajustar `catalog.ts` para consultar `tatame_50x50_nb` quando cliente pedir desconto.

---

## Arquivos envolvidos

| Arquivo | O que faz |
|---------|-----------|
| `src/lib/woocommerce.ts` | Cliente HTTP da API WooCommerce |
| `scripts/sync-catalog.ts` | Script de sincronizacao WooCommerce → catalogo |
| `BACKEND_BASE/catalogo_produtos.json` | Catalogo gerado (v3.0.0) |
| `.env` / `.env.example` | Credenciais WooCommerce |
| `ops/woocommerce-sync.md` | Esta documentacao |

---

## Proximo passo

1. **Validar precos WhatsApp vs Site:** Confirmar com o dono se precos WhatsApp sao iguais aos do site. Se forem diferentes, criar campo `preco_whatsapp` nas business rules.

2. **Agendar sincronizacao periodica:** Rodar `npm run sync:catalog` toda vez que mudar precos no WooCommerce. Pode ser automatizado via cron ou CI/CD.

3. **Adicionar ao deploy:** No script de deploy da Hostinger, rodar sync antes de iniciar o servidor:
   ```bash
   npm run sync:catalog && npm run start
   ```

4. **Monitorar produtos nao mapeados:** O sync avisa sobre produtos no WooCommerce que nao tem mapeamento no bot. Se novos produtos forem adicionados ao site, adicionar o mapeamento em `CATEGORY_MAPPINGS`.
