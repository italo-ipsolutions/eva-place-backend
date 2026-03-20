#!/usr/bin/env tsx
/**
 * sync-catalog.ts — Sincroniza catalogo do WooCommerce para BACKEND_BASE/catalogo_produtos.json
 *
 * USO:
 *   npx tsx scripts/sync-catalog.ts              # gera catalogo e salva
 *   npx tsx scripts/sync-catalog.ts --dry-run     # mostra o que faria, sem salvar
 *   npx tsx scripts/sync-catalog.ts --diff         # mostra diferencas vs catalogo atual
 *
 * FONTE DE VERDADE:
 *   - Precos, cores, estoque, SKU → WooCommerce (fonte primaria)
 *   - Regras de negocio (tabela_precos kit, uso_recomendado, argumento_comercial,
 *     restricoes, frete_especial, nota_marca) → regras locais neste script
 *
 * O WooCommerce vende avulso. Kits sao regra de negocio do WhatsApp (nao existem no Woo).
 */

import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WooCommerceClient, createWooClientFromEnv } from "../src/lib/woocommerce.js";
import type { WooProduct, WooVariation } from "../src/lib/woocommerce.js";

// ---------- Configuracao ----------

const BASE_PATH = resolve(process.cwd(), process.env.CONTEXT_BASE_PATH ?? "./BACKEND_BASE");
const OUTPUT_FILE = resolve(BASE_PATH, "catalogo_produtos.json");
const DRY_RUN = process.argv.includes("--dry-run");
const SHOW_DIFF = process.argv.includes("--diff");

// ---------- Regras de negocio locais (NAO vem do WooCommerce) ----------
// Essas regras controlam como o bot apresenta os produtos no WhatsApp.
// Precos de kit sao calculados a partir do preco avulso do WooCommerce.

interface KitRule {
  faixa: string;
  qty: number;
  /** Desconto sobre o preco avulso. Ex: 0.05 = 5% off */
  discountPct: number;
}

/** Tabela de kits para tatames 50x50 — desconto progressivo baseado no preco avulso WooCommerce */
const KIT_RULES_50x50: KitRule[] = [
  { faixa: "1 a 4 un", qty: 1, discountPct: 0 },
  { faixa: "Kit 6", qty: 6, discountPct: 0.04 },
  { faixa: "Kit 8", qty: 8, discountPct: 0.08 },
  { faixa: "Kit 9", qty: 9, discountPct: 0.10 },
  { faixa: "Kit 12", qty: 12, discountPct: 0.12 },
  { faixa: "Kit 16", qty: 16, discountPct: 0.14 },
  { faixa: "Kit 18", qty: 18, discountPct: 0.15 },
  { faixa: "Kit 20+", qty: 20, discountPct: 0.17 },
];

/** Mapeamento SKU → regras de negocio que nao existem no WooCommerce */
interface BusinessRules {
  uso_recomendado: string;
  argumento_comercial: string;
  restricoes?: string[];
  frete_especial?: string;
  nota_marca?: string;
}

const BUSINESS_RULES: Record<string, BusinessRules> = {
  // Tatames 50x50
  "TAT-50x50-10": {
    uso_recomendado: "Bebe, Protecao Termica, chao frio",
    argumento_comercial: "Ideal pra fase de engatinhar, protege do frio e dos joelhinhos.",
  },
  "TAT-50x50-15": {
    uso_recomendado: "Intermediario, sentar, conforto extra",
    argumento_comercial: "Mais macio, bom pra quando o bebe comeca a sentar.",
  },
  "TAT-50x50-20": {
    uso_recomendado: "Acustico, correr, pular, playground",
    argumento_comercial: "Absorve impacto de pulos e corrida. Bom pra area de brincadeira ativa.",
    nota_marca: "Preco padrao do site. Linha NB (preco menor) disponivel na categoria Ofertas.",
  },
  // Tatames 50x50 NB (Ofertas)
  "NB-TAT-50x50-20": {
    uso_recomendado: "Acustico, correr, pular, playground",
    argumento_comercial: "Linha NB — mesmo material, preco mais acessivel.",
    nota_marca: "Linha NB com preco reduzido. Mesmo produto, marca diferente.",
  },
  "MAX50X50X20": {
    uso_recomendado: "Acustico, correr, pular, playground",
    argumento_comercial: "Linha MX — preco intermediario.",
    nota_marca: "Linha MX com preco intermediario.",
  },
  "MAX50X50X15": {
    uso_recomendado: "Intermediario, sentar, conforto extra",
    argumento_comercial: "Linha MX 15mm — preco intermediario.",
    nota_marca: "Linha MX com preco intermediario.",
  },
  // Tatames 100x100
  "TAT-100x100-10": {
    uso_recomendado: "Area baby, forrar chao frio",
    argumento_comercial: "Placa grande 1m², facil de instalar. Ideal pra area de bebe.",
    frete_especial: "MOTO ate 10 un. Acima disso alerta sobre volume.",
  },
  "NB-TAT-100x100-10": {
    uso_recomendado: "Area baby, forrar chao frio",
    argumento_comercial: "Linha NB 1x1m — preco mais acessivel.",
    frete_especial: "MOTO ate 10 un. Acima disso alerta sobre volume.",
    nota_marca: "Linha NB com preco reduzido.",
  },
  "TAT-100x100-20": {
    uso_recomendado: "Pilates, funcional, area escolar",
    argumento_comercial: "Espessura intermediaria. Absorve impacto e protege o chao.",
    restricoes: ["NAO recomendado para artes marciais com quedas"],
    frete_especial: "CARRO obrigatorio. Confirmar taxa com logistica.",
  },
  "TAT-100x100-30": {
    uso_recomendado: "Jiu-Jitsu infantil, Karate, Judo iniciante",
    argumento_comercial: "Espessura para luta. Minimo seguro para treino de artes marciais.",
    restricoes: ["Minimo seguro para treino de luta"],
    frete_especial: "CARRO obrigatorio. Confirmar taxa com logistica.",
  },
  "TAT-100x100-40": {
    uso_recomendado: "Profissional. Quedas de adulto, Dojo oficial.",
    argumento_comercial: "Maximo de absorcao de impacto. Para artes marciais profissionais.",
    frete_especial: "CARRO obrigatorio. Confirmar taxa com logistica.",
  },
};

// ---------- Mapeamento de produto WooCommerce → categoria do catalogo ----------

interface CategoryMapping {
  catId: string;
  catName: string;
  /** Funcao que identifica se um produto WooCommerce pertence a esta categoria */
  match: (p: WooProduct) => boolean;
  /** Tipo de processamento */
  type: "tatame_50x50" | "tatame_1x1m" | "kids" | "simple_list" | "cartelas";
  /** Descricao para o catalogo */
  descricao?: string;
}

const CATEGORY_MAPPINGS: CategoryMapping[] = [
  {
    catId: "tatame_50x50",
    catName: "Tatame EVA 50x50cm",
    match: (p) => /^TAT-50x50-\d+$/.test(p.sku),
    type: "tatame_50x50",
    descricao: "Carro-chefe da loja. Preco regressivo por quantidade. Vendido como 'Monte seu Kit' no site.",
  },
  {
    catId: "tatame_50x50_nb",
    catName: "Tatame EVA 50x50cm — Linha NB/MX (Ofertas)",
    match: (p) => /^(NB-TAT-50x50|MAX50X50)/.test(p.sku),
    type: "tatame_50x50",
    descricao: "Linhas NB e MX — mesmo produto, marcas com preco menor. Disponivel na categoria Ofertas do site.",
  },
  {
    catId: "tatame_1x1m",
    catName: "Tatame EVA 1x1m (Profissional)",
    match: (p) => /^(TAT-100x100|NB-TAT-100x100)-\d+/.test(p.sku),
    type: "tatame_1x1m",
    descricao: "Pecas de 1 metro quadrado. Atencao ao frete de carro para grandes quantidades.",
  },
  {
    catId: "tapetes_encaixe_kids",
    catName: "Tapetes de Encaixe Modulares 30x30cm (Kids/Pedagogico)",
    match: (p) => /^(EVA-(ANI|NUM|OBJ|GEO)|TAP-ALF|TE-AMA|ARCO)/.test(p.sku),
    type: "kids",
    descricao: "Todos tem espessura de 8mm. Foco educacional.",
  },
  {
    catId: "rolos_esteiras",
    catName: "Rolos e Esteiras (Portáteis com Alça)",
    match: (p) => /^EVA-(MESV|PASSCID)/.test(p.sku),
    type: "simple_list",
    descricao: "Nao desmontam. Vem com alca para levar no parque.",
  },
  {
    catId: "miudezas",
    catName: "Miudezas (Upsell de Caixa)",
    match: (p) => /^EVA-ALFA/.test(p.sku),
    type: "simple_list",
    descricao: "Itens de ALTO GIRO e TICKET BAIXO. Oferecer como algo a mais no final da venda (Upsell).",
  },
  {
    catId: "cartelas_avulsas",
    catName: "Cartelas Avulsas (Jogos e Atividades)",
    match: (p) => /^EVA-TAB$/.test(p.sku),
    type: "cartelas",
    descricao: "EVA adesivado ou impresso. Tamanho folha A4.",
  },
  {
    catId: "yoga_mat",
    catName: "Tapete de Yoga (Mat) com Alca",
    match: (p) => /^YOGA-/.test(p.sku),
    type: "simple_list",
  },
  {
    catId: "cantoneira",
    catName: "Cantoneira de Protecao (Quina) - Autoadesiva",
    match: (p) => /^CANT-/.test(p.sku),
    type: "simple_list",
  },
  {
    catId: "step_eva",
    catName: "Step EVA (Exercicio)",
    match: (p) => /^STEP-/.test(p.sku),
    type: "simple_list",
  },
  {
    catId: "flutuante",
    catName: "Tapetes Flutuantes (Piscina/Lagos)",
    match: (p) => /^FLUT-/.test(p.sku),
    type: "simple_list",
  },
  {
    catId: "prancha_natacao",
    catName: "Prancha Natacao",
    match: (p) => /^PRN-/.test(p.sku),
    type: "simple_list",
  },
  {
    catId: "protetor_porta",
    catName: "Protetor de Porta (Bichinho)",
    match: (p) => /^PROT-PORTA/.test(p.sku),
    type: "simple_list",
  },
];

// ---------- Transformadores ----------

function extractThicknessMm(name: string, sku: string): number {
  // Tentar do nome: "Tatame 50x50cm 20mm" → 20
  const nameMatch = name.match(/(\d+)\s*mm/i);
  if (nameMatch) return parseInt(nameMatch[1], 10);
  // Tentar do SKU: TAT-50x50-20 → 20
  const skuMatch = sku.match(/-(\d+)$/);
  if (skuMatch) return parseInt(skuMatch[1], 10);
  return 0;
}

function buildKitPriceTable(avulsoPrice: number): Array<{
  faixa: string;
  preco_total: number | null;
  preco_unitario: number;
  nota?: string;
}> {
  return KIT_RULES_50x50.map((kit) => {
    const unitPrice = Math.round((avulsoPrice * (1 - kit.discountPct)) * 100) / 100;
    const isAvulso = kit.qty === 1;
    const isOpen = kit.qty === 20;
    return {
      faixa: kit.faixa,
      preco_total: isAvulso ? null : (isOpen ? null : Math.round(unitPrice * kit.qty * 100) / 100),
      preco_unitario: unitPrice,
      ...(isOpen ? { nota: `Qtd x R$ ${unitPrice.toFixed(2)}` } : {}),
    };
  });
}

function classifyColors(
  variations: WooVariation[],
  attrName: string
): { cores_disponiveis: string[]; cores_em_falta: string[] } {
  const inStock: string[] = [];
  const outOfStock: string[] = [];

  for (const v of variations) {
    const attr = v.attributes.find((a) => a.name === attrName);
    if (!attr) continue;
    if (v.stock_status === "instock") {
      inStock.push(attr.option);
    } else {
      outOfStock.push(attr.option);
    }
  }

  return {
    cores_disponiveis: [...new Set(inStock)].sort(),
    cores_em_falta: [...new Set(outOfStock)].sort(),
  };
}

/** Transforma tatames 50x50 em variantes com tabela de precos */
function buildTatame50x50Category(
  products: WooProduct[],
  variations: Map<number, WooVariation[]>,
  catId: string,
  catName: string,
  descricao: string
): Record<string, unknown> {
  // Ordenar por espessura
  const sorted = [...products].sort((a, b) => {
    return extractThicknessMm(a.name, a.sku) - extractThicknessMm(b.name, b.sku);
  });

  const variantes = sorted.map((p) => {
    const mm = extractThicknessMm(p.name, p.sku);
    const avulsoPrice = parseFloat(p.price);
    const vars = variations.get(p.id) ?? [];
    const colors = classifyColors(vars, "Cor");
    const rules = BUSINESS_RULES[p.sku] ?? {};

    return {
      espessura_mm: mm,
      woo_product_id: p.id,
      woo_sku: p.sku,
      woo_price: avulsoPrice,
      woo_stock_status: p.stock_status,
      uso_recomendado: rules.uso_recomendado ?? "",
      argumento_comercial: rules.argumento_comercial ?? "",
      tabela_precos: buildKitPriceTable(avulsoPrice),
      ...colors,
      restricoes: rules.restricoes ?? [],
      ...(rules.frete_especial ? { frete_especial: rules.frete_especial } : {}),
      ...(rules.nota_marca ? { nota_marca: rules.nota_marca } : {}),
      validacao: `Sincronizado do WooCommerce em ${new Date().toISOString().slice(0, 10)}. Preco avulso R$ ${avulsoPrice.toFixed(2)}.`,
    };
  });

  return {
    id: catId,
    nome: catName,
    descricao,
    regra_quantidade: "Se o cliente pedir quantidade que nao e kit fechado, somar Kit inferior + avulsas ou sugerir Kit superior.",
    variantes,
  };
}

/** Transforma tatames 1x1m em variantes simples */
function buildTatame1x1Category(
  products: WooProduct[],
  variations: Map<number, WooVariation[]>,
  descricao: string
): Record<string, unknown> {
  // Separar NB e padrao, juntar todos na mesma categoria
  const sorted = [...products].sort((a, b) => {
    return extractThicknessMm(a.name, a.sku) - extractThicknessMm(b.name, b.sku);
  });

  // Agrupar por espessura (NB e padrao da mesma espessura ficam no mesmo entry)
  const byThickness = new Map<number, WooProduct[]>();
  for (const p of sorted) {
    const mm = extractThicknessMm(p.name, p.sku);
    if (!byThickness.has(mm)) byThickness.set(mm, []);
    byThickness.get(mm)!.push(p);
  }

  const variantes = [...byThickness.entries()].sort((a, b) => a[0] - b[0]).map(([mm, prods]) => {
    // Produto padrao (sem NB no SKU) tem prioridade para preco
    const mainProd = prods.find((p) => !p.sku.startsWith("NB-")) ?? prods[0];
    const nbProd = prods.find((p) => p.sku.startsWith("NB-"));
    const mainPrice = parseFloat(mainProd.price);
    const vars = variations.get(mainProd.id) ?? [];
    const nbVars = nbProd ? (variations.get(nbProd.id) ?? []) : [];

    // Cores: unir cores do padrao + NB
    const mainColors = classifyColors(vars, "Cor");
    const nbColors = nbProd ? classifyColors(nbVars, "Cor") : { cores_disponiveis: [], cores_em_falta: [] };
    const allInStock = [...new Set([...mainColors.cores_disponiveis, ...nbColors.cores_disponiveis])].sort();
    const allOutOfStock = [...new Set([
      ...mainColors.cores_em_falta.filter((c) => !allInStock.includes(c)),
      ...nbColors.cores_em_falta.filter((c) => !allInStock.includes(c)),
    ])].sort();

    const rules = BUSINESS_RULES[mainProd.sku] ?? {};

    return {
      espessura_mm: mm,
      woo_product_id: mainProd.id,
      woo_sku: mainProd.sku,
      preco_unitario: mainPrice,
      woo_stock_status: mainProd.stock_status,
      ...(nbProd ? {
        preco_nb: parseFloat(nbProd.price),
        woo_nb_product_id: nbProd.id,
        woo_nb_sku: nbProd.sku,
      } : {}),
      uso_recomendado: rules.uso_recomendado ?? "",
      cores_disponiveis: allInStock,
      cores_em_falta: allOutOfStock,
      restricoes: rules.restricoes ?? [],
      ...(rules.frete_especial ? { frete_especial: rules.frete_especial } : {}),
      ...(nbProd ? {
        nota_marca: `Linha NB existe a R$ ${parseFloat(nbProd.price).toFixed(2)}/un. Preco padrao R$ ${mainPrice.toFixed(2)}.`,
      } : (rules.nota_marca ? { nota_marca: rules.nota_marca } : {})),
      validacao: `Sincronizado do WooCommerce em ${new Date().toISOString().slice(0, 10)}. Preco site R$ ${mainPrice.toFixed(2)}.`,
    };
  });

  return {
    id: "tatame_1x1m",
    nome: "Tatame EVA 1x1m (Profissional)",
    descricao,
    regra_quantidade: null,
    variantes,
  };
}

/** Transforma produtos kids 30x30 */
function buildKidsCategory(
  products: WooProduct[],
  descricao: string
): Record<string, unknown> {
  const prods = products.map((p) => {
    const piecesMatch = p.name.match(/(\d+)\s*[Pp]e[cç]as?/);
    const qtd = piecesMatch ? parseInt(piecesMatch[1], 10) : 1;
    // Extrair modelo do nome
    let modelo = p.name
      .replace(/Tapete EVA\s*/i, "")
      .replace(/Infantil\s*/i, "")
      .replace(/30x30cm\s*/i, "")
      .replace(/8mm\s*/i, "")
      .replace(/\(\d+\s*[Pp]e[cç]as?\)\s*/i, "")
      .replace(/de EVA\s*/i, "")
      .replace(/Divertido\s*/i, "")
      .trim();
    if (!modelo) modelo = p.name;

    return {
      modelo,
      woo_product_id: p.id,
      woo_sku: p.sku,
      qtd_pecas: qtd,
      preco: parseFloat(p.price),
      woo_stock_status: p.stock_status,
      validacao: `Sincronizado do WooCommerce. R$ ${parseFloat(p.price).toFixed(2)}.`,
    };
  });

  return {
    id: "tapetes_encaixe_kids",
    nome: "Tapetes de Encaixe Modulares 30x30cm (Kids/Pedagogico)",
    descricao,
    restricoes_gerais: {
      idade_recomendada: "Acima de 3 anos",
      motivo: "Pecas pequenas destacaveis podem ser engolidas por criancas menores.",
    },
    produtos: prods,
  };
}

/** Transforma cartelas (variavel com atributo Modelo) */
function buildCartelasCategory(
  products: WooProduct[],
  variations: Map<number, WooVariation[]>,
  descricao: string
): Record<string, unknown> {
  // Cartelas sao 1 produto variavel — pegar as variacoes
  const p = products[0];
  if (!p) return { id: "cartelas_avulsas", nome: "Cartelas Avulsas", descricao, produtos: [] };

  const vars = variations.get(p.id) ?? [];
  const prods = vars.map((v) => {
    const modelo = v.attributes.find((a) => a.name === "Modelo")?.option ?? v.sku;
    return {
      modelo,
      woo_variation_id: v.id,
      woo_sku: v.sku,
      preco: parseFloat(v.price),
      woo_stock_status: v.stock_status,
    };
  }).filter((v) => v.woo_stock_status === "instock");

  return {
    id: "cartelas_avulsas",
    nome: "Cartelas Avulsas (Jogos e Atividades)",
    descricao,
    preco_unico: prods[0]?.preco ?? 5.00,
    argumento_geral: "Aproveita o frete! Por 5 reais voce leva um jogo educativo ou reforco escolar.",
    produtos: prods,
    validacao: `Sincronizado do WooCommerce. ${prods.length} modelos em estoque.`,
  };
}

/** Transforma produtos simples (yoga, cantoneira, step, flutuante, etc) */
function buildSimpleCategory(
  products: WooProduct[],
  variations: Map<number, WooVariation[]>,
  catId: string,
  catName: string,
  descricao?: string
): Record<string, unknown> {
  const prods = products.map((p) => {
    const vars = variations.get(p.id) ?? [];
    const colors = p.type === "variable" ? classifyColors(vars, "Cor") : undefined;
    const modelos = p.type === "variable" && !colors?.cores_disponiveis.length
      ? classifyColors(vars, "Modelo")
      : undefined;

    // Extrair modelo do nome
    let modelo = p.name;
    const mmMatch = p.name.match(/(\d+)mm/);
    const sizeMatch = p.name.match(/(\d+x\d+cm)/);

    const result: Record<string, unknown> = {
      modelo,
      woo_product_id: p.id,
      woo_sku: p.sku,
      preco: parseFloat(p.price),
      woo_stock_status: p.stock_status,
    };

    if (sizeMatch) result.tamanho = sizeMatch[1];
    if (mmMatch) result.espessura_mm = parseInt(mmMatch[1], 10);
    if (colors?.cores_disponiveis.length) {
      result.cores_disponiveis = colors.cores_disponiveis;
      if (colors.cores_em_falta.length) result.cores_em_falta = colors.cores_em_falta;
    }
    if (modelos?.cores_disponiveis.length) {
      result.modelos_disponiveis = modelos.cores_disponiveis;
    }

    // Business rules
    const rules = BUSINESS_RULES[p.sku];
    if (rules?.restricoes?.length) result.restricoes = rules.restricoes;
    if (rules?.frete_especial) result.frete_especial = rules.frete_especial;

    result.validacao = `Sincronizado do WooCommerce. R$ ${parseFloat(p.price).toFixed(2)}.`;
    return result;
  });

  const cat: Record<string, unknown> = {
    id: catId,
    nome: catName,
    produtos: prods,
  };
  if (descricao) cat.descricao = descricao;

  // Avisos especificos
  if (catId === "flutuante") cat.aviso_seguranca = "NAO e salva-vidas!";

  return cat;
}

// ---------- Main ----------

async function main() {
  console.log("🔄 Sincronizando catalogo do WooCommerce...\n");

  // Carregar .env se existir
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch {
    // dotenv ja pode estar carregado
  }

  const client = createWooClientFromEnv();

  // Testar conexao
  console.log("📡 Testando conexao com WooCommerce...");
  const ok = await client.testConnection();
  if (!ok) {
    console.error("❌ Falha na conexao com WooCommerce. Verifique WOOCOMMERCE_BASE_URL, CONSUMER_KEY e CONSUMER_SECRET.");
    process.exit(1);
  }
  console.log("✅ Conexao OK\n");

  // Buscar todos os produtos
  console.log("📦 Buscando produtos...");
  const allProducts = await client.getAllProducts();
  console.log(`   ${allProducts.length} produtos encontrados\n`);

  // Buscar variacoes de produtos variaveis
  console.log("🎨 Buscando variacoes...");
  const variationsMap = new Map<number, WooVariation[]>();
  const variableProducts = allProducts.filter((p) => p.type === "variable" && p.variations.length > 0);

  let varCount = 0;
  for (const p of variableProducts) {
    const vars = await client.getVariations(p.id);
    variationsMap.set(p.id, vars);
    varCount += vars.length;
    process.stdout.write(`   ${p.name} → ${vars.length} variacoes\n`);
  }
  console.log(`   Total: ${varCount} variacoes\n`);

  // Classificar produtos por categoria
  const productsByCategory = new Map<string, WooProduct[]>();
  const unmatched: WooProduct[] = [];

  for (const p of allProducts) {
    let matched = false;
    for (const mapping of CATEGORY_MAPPINGS) {
      if (mapping.match(p)) {
        if (!productsByCategory.has(mapping.catId)) productsByCategory.set(mapping.catId, []);
        productsByCategory.get(mapping.catId)!.push(p);
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(p);
  }

  if (unmatched.length > 0) {
    console.log("⚠️  Produtos nao mapeados (nao estao no catalogo do bot):");
    for (const p of unmatched) {
      console.log(`   - ${p.name} (SKU: ${p.sku})`);
    }
    console.log();
  }

  // Construir catalogo
  console.log("🏗️  Construindo catalogo...\n");
  const categorias: Array<Record<string, unknown>> = [];

  for (const mapping of CATEGORY_MAPPINGS) {
    const products = productsByCategory.get(mapping.catId);
    if (!products?.length) continue;

    switch (mapping.type) {
      case "tatame_50x50":
        categorias.push(
          buildTatame50x50Category(products, variationsMap, mapping.catId, mapping.catName, mapping.descricao ?? "")
        );
        break;
      case "tatame_1x1m":
        categorias.push(buildTatame1x1Category(products, variationsMap, mapping.descricao ?? ""));
        break;
      case "kids":
        categorias.push(buildKidsCategory(products, mapping.descricao ?? ""));
        break;
      case "cartelas":
        categorias.push(buildCartelasCategory(products, variationsMap, mapping.descricao ?? ""));
        break;
      case "simple_list":
        categorias.push(
          buildSimpleCategory(products, variationsMap, mapping.catId, mapping.catName, mapping.descricao)
        );
        break;
    }
  }

  const catalogo = {
    _meta: {
      versao: "3.0.0",
      fonte: "WooCommerce REST API v3 — evaplace.com.br",
      data_atualizacao: new Date().toISOString().slice(0, 10),
      sincronizado_em: new Date().toISOString(),
      notas: "Precos e estoque do WooCommerce. Tabela de kits e regras de negocio sao locais.",
      total_produtos_woo: allProducts.length,
      total_variacoes_woo: varCount,
    },
    categorias,
  };

  // Output
  const jsonStr = JSON.stringify(catalogo, null, 2);

  if (SHOW_DIFF) {
    console.log("📊 Comparando com catalogo atual...\n");
    try {
      const current = await readFile(OUTPUT_FILE, "utf-8");
      const currentObj = JSON.parse(current);

      // Comparar precos dos tatames
      for (const newCat of catalogo.categorias) {
        const oldCat = currentObj.categorias?.find((c: any) => c.id === (newCat as any).id);
        if (!oldCat) {
          console.log(`  🆕 Nova categoria: ${(newCat as any).id}`);
          continue;
        }

        // Comparar variantes (tatames)
        if ((newCat as any).variantes && oldCat.variantes) {
          for (const nv of (newCat as any).variantes) {
            const ov = oldCat.variantes.find((v: any) => v.espessura_mm === nv.espessura_mm);
            if (!ov) {
              console.log(`  🆕 ${(newCat as any).id}: nova variante ${nv.espessura_mm}mm`);
              continue;
            }
            const oldPrice = ov.tabela_precos?.[0]?.preco_unitario ?? ov.preco_unitario;
            const newPrice = nv.tabela_precos?.[0]?.preco_unitario ?? nv.preco_unitario;
            if (oldPrice !== newPrice) {
              console.log(`  💰 ${(newCat as any).id} ${nv.espessura_mm}mm: R$ ${oldPrice} → R$ ${newPrice}`);
            }

            // Comparar cores
            const oldColors = (ov.cores_disponiveis ?? []).length;
            const newColors = (nv.cores_disponiveis ?? []).length;
            if (oldColors !== newColors) {
              console.log(`  🎨 ${(newCat as any).id} ${nv.espessura_mm}mm: ${oldColors} → ${newColors} cores em estoque`);
            }
          }
        }

        // Comparar produtos simples
        if ((newCat as any).produtos && oldCat.produtos) {
          for (const np of (newCat as any).produtos) {
            const op = oldCat.produtos.find((p: any) => p.modelo === np.modelo);
            if (!op) {
              console.log(`  🆕 ${(newCat as any).id}: novo produto "${np.modelo}"`);
              continue;
            }
            if (op.preco !== np.preco) {
              console.log(`  💰 ${(newCat as any).id} "${np.modelo}": R$ ${op.preco} → R$ ${np.preco}`);
            }
          }
        }
      }
    } catch (err) {
      console.log("  (catalogo atual nao encontrado ou invalido, sem diff)\n");
    }
    console.log();
  }

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — catalogo gerado (nao salvo):\n");
    console.log(jsonStr);
    console.log(`\n📁 Seria salvo em: ${OUTPUT_FILE}`);
  } else {
    await writeFile(OUTPUT_FILE, jsonStr, "utf-8");
    console.log(`✅ Catalogo salvo em: ${OUTPUT_FILE}`);
    console.log(`   ${categorias.length} categorias`);
    console.log(`   Versao: 3.0.0 (WooCommerce sync)`);
  }

  // Resumo
  console.log("\n--- Resumo ---");
  for (const cat of categorias) {
    const c = cat as any;
    if (c.variantes) {
      console.log(`  ${c.id}: ${c.variantes.length} variantes (espessuras)`);
    } else if (c.produtos) {
      console.log(`  ${c.id}: ${c.produtos.length} produtos`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
