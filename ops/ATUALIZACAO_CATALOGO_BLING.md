# Atualizacao do Catalogo — Baseada em Dados Reais do Bling

**Data:** 2026-03-20
**Fonte:** `data/itens_pedido_bling_90dias.csv` (770 itens, 264 pedidos, dez/2025 a mar/2026)
**Arquivo atualizado:** `BACKEND_BASE/catalogo_produtos.json` (v1.0.0 → v2.0.0)

---

## Correcoes aplicadas

### Precos corrigidos

| Produto | Antes | Depois | Evidencia |
|---------|-------|--------|-----------|
| Tatame 1x1m 20mm | R$ 70,00 | **R$ 65,00** | 50 un vendidas, preco mais frequente R$ 65 |

### Cores adicionadas (confirmadas por vendas reais)

| Produto | Cores novas |
|---------|------------|
| Tatame 50x50 10mm | Cinza |
| Tatame 50x50 15mm | Amarelo, Amarelo BB, Branco, Cinza, Laranja, Lilas BB, Marrom |
| Tatame 50x50 20mm | Rosa Pink, Azul Marinho, Azul Royal, Verde Militar, Verde Agua, Beringela, Salmon, Cinza |
| Tatame 1x1m 10mm | Azul Royal, Rosa BB, Verde Escuro |
| Tatame 1x1m 20mm | Azul Royal, Verde Escuro |
| Tatame 1x1m 30mm | Azul Royal |

### Cores removidas de "em falta" (vendidas nos 90 dias)

| Produto | Cores removidas de "em falta" |
|---------|------------------------------|
| Tatame 50x50 15mm | Preto, Marrom, Branco, Amarelo, Laranja, Lilas BB, Rosa |
| Tatame 50x50 20mm | Preto, Vermelho, Branco, Azul, Azul Marinho, Laranja, Lilas BB, Marrom |

### Marcas documentadas

- Adicionada nota sobre linha **NB** (preco menor) vs linha **MX/MAX** (preco padrao) no tatame 50x50 20mm e 1x1m 10mm
- Bot informa preco padrao e menciona linha NB se cliente pedir desconto

### Produtos adicionados/expandidos

- Cartelas: adicionados modelos "Meses e Estacoes", "Soma e Diversao", "Profissoes", "Triangulos" (confirmados no Bling)
- Removido "Mapa da Regiao Sul" e "Relogio/Profissoes" (nao confirmados em vendas)

### Validacao adicionada

- Cada produto agora tem campo `validacao` indicando se foi confirmado pelo Bling ou ficou como `pendente_validacao`

---

## O que NAO foi possivel confirmar

| Item | Motivo |
|------|--------|
| Step EVA (3 modelos) | Zero vendas nos 90 dias. Pode estar fora de estoque. |
| Tapete Geometrico | Zero vendas. Pode estar fora de estoque. |
| Esteira Mesversario | Nao identificado com certeza no Bling. |
| Precos de kit 50x50 10mm | Kit 12 aparece a R$ 120 E R$ 126 no Bling. Mantido R$ 126 (preco WhatsApp). Pode ser que R$ 120 seja preco WooCommerce. |
| Diferenciacao por marca no 50x50 20mm | Bot responde preco padrao MX. Linha NB a R$ 14 nao e oferecida proativamente. |

---

## Proximo passo

1. **Validar com o dono:** Step EVA ainda e vendido? Geometrico tem estoque?
2. **Exportar PRODUTOS ATIVOS.gsheet como CSV** para cruzar produtos ativos no site
3. **Gerar chaves WooCommerce REST API** para automatizar sincronizacao futura
4. **Definir politica de marca:** bot deve mencionar linha NB ou nao?
