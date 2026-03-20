import { getContext } from "./context-loader.js";
import type { CategoriaProduto, ManyChatResponse } from "../types/index.js";
import type { DetectedIntent } from "./intent.js";

/** Normaliza texto para busca: lowercase, sem acentos */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Checa se o termo aparece como palavra inteira (frases usam includes) */
function termMatches(query: string, term: string): boolean {
  if (term.includes(" ")) return query.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s|[^a-z])${escaped}(?:$|\\s|[^a-z])`).test(query);
}

/**
 * Busca categorias/produtos que casam com a mensagem.
 * Quando recebe intent com explicitSize, usa isso para selecionar a categoria CORRETA
 * ao inves de depender da ordem do termMap (que antes matchava "tatame" → 50x50 primeiro).
 *
 * PRIORIDADE:
 * 1. intent.explicitSize → seleciona tatame_50x50 ou tatame_1x1m diretamente
 * 2. intent.useCase com productSize → seleciona categoria pelo uso
 * 3. termMap generico → fallback (ordem nao importa mais para tatames)
 */
export function findProduct(message: string, intent?: DetectedIntent): CategoriaProduto | null {
  const ctx = getContext();
  const q = normalize(message);

  // ---- 1. TAMANHO EXPLICITO do intent tem prioridade maxima ----
  const targetSize = intent?.explicitSize ?? (intent?.useCase ? undefined : undefined);
  // Se intent define explicitSize OU useCase com productSize inferido
  const inferredSize = intent?.explicitSize
    // Se nao tem explicitSize, mas useCase sugere um productSize, usar esse
    // (productSize vem do USE_CASE_MAP em intent.ts, ex: "bebe" → "50x50", "jiu-jitsu" → "1x1")
    // Porem, o intent.ts ja resolve isso e coloca em explicitSize quando ha useCase.
    // Entao aqui basta checar explicitSize.
    ;

  if (intent?.explicitSize === "1x1") {
    const cat = ctx.catalogo.categorias.find((c) => c.id === "tatame_1x1m");
    if (cat) return cat;
  }

  if (intent?.explicitSize === "50x50") {
    const cat = ctx.catalogo.categorias.find((c) => c.id === "tatame_50x50");
    if (cat) return cat;
  }

  // ---- 2. Mapeamento de termos para categorias (SEM "tatame" generico) ----
  // "tatame" generico agora e tratado por ultimo para evitar falso positivo
  const termMap: Record<string, string[]> = {
    // Tatames com termos ESPECIFICOS (nao generico "tatame")
    tatame_50x50: ["tapete eva", "50x50", "bebe", "engatinhar", "piso eva"],
    tatame_1x1m: ["1x1", "1 metro", "um metro", "profissional", "jiu-jitsu", "jiu jitsu", "jiujitsu", "judo", "karate", "dojo", "luta", "arte marcial", "artes marciais"],
    // Outros produtos
    tapetes_encaixe_kids: ["alfabeto", "letras", "numeros", "animais", "amarelinha", "pedagogico", "educativo", "escola"],
    rolos_esteiras: ["rolo", "esteira", "pista de carrinho", "mesversario"],
    miudezas: ["saco de letras", "pote de letras", "letras soltas"],
    cartelas_avulsas: ["cartela", "jogo da velha", "tangram", "tabuada", "domino", "jogo de memoria", "dama", "resta um"],
    yoga_mat: ["yoga", "tapete yoga"],
    cantoneira: ["cantoneira", "protecao quina", "protecao de canto"],
    step_eva: ["step eva", "step de exercicio"],
    flutuante: ["flutuante", "tapete piscina", "boia eva"],
    prancha_natacao: ["prancha natacao", "prancha de nadar"],
    protetor_porta: ["protetor de porta", "bichinho de porta"],
  };

  for (const [catId, terms] of Object.entries(termMap)) {
    if (terms.some((t) => termMatches(q, t))) {
      const cat = ctx.catalogo.categorias.find((c) => c.id === catId);
      if (cat) return cat;
    }
  }

  // ---- 3. "tatame" generico: so chega aqui se nenhum termo especifico bateu ----
  // Se tem "tatame" mas nao casou nada acima, e porque nao tem spec explicita.
  // Default para 50x50 (produto mais vendido) — a menos que useCase sugira 1x1
  if (termMatches(q, "tatame") || termMatches(q, "eva")) {
    // Se useCase sugere 1x1 (artes marciais, academia), usar 1x1
    if (intent?.useCase && ["artes_marciais", "academia"].includes(intent.useCase)) {
      const cat = ctx.catalogo.categorias.find((c) => c.id === "tatame_1x1m");
      if (cat) return cat;
    }
    // Default: 50x50 (produto mais popular)
    const cat = ctx.catalogo.categorias.find((c) => c.id === "tatame_50x50");
    if (cat) return cat;
  }

  return null;
}

/**
 * Encontra o melhor kit para uma quantidade de pecas.
 */
function findBestKit(
  tabela: Array<{ faixa: string; preco_total: number | null; preco_unitario: number; nota?: string }>,
  qty: number
): { faixa: string; precoUnit: number; precoTotal: number } {
  // Procurar kit exato ou imediatamente superior
  const kits = tabela.map((t) => {
    const kitMatch = t.faixa.match(/Kit\s*(\d+)/);
    const kitQty = kitMatch ? parseInt(kitMatch[1], 10) : 0;
    return { ...t, kitQty };
  }).filter((t) => t.kitQty > 0);

  // Kit exato?
  const exact = kits.find((k) => k.kitQty === qty);
  if (exact) {
    return {
      faixa: exact.faixa,
      precoUnit: exact.preco_unitario,
      precoTotal: exact.preco_total ?? qty * exact.preco_unitario,
    };
  }

  // Kit 20+ para quantidades grandes
  if (qty >= 20) {
    const kit20 = tabela.find((t) => t.faixa.includes("20"));
    if (kit20) {
      return {
        faixa: `${qty} pecas`,
        precoUnit: kit20.preco_unitario,
        precoTotal: qty * kit20.preco_unitario,
      };
    }
  }

  // Achar o kit mais proximo (superior)
  const superior = kits.filter((k) => k.kitQty >= qty).sort((a, b) => a.kitQty - b.kitQty);
  if (superior.length > 0) {
    const best = superior[0];
    return {
      faixa: best.faixa,
      precoUnit: best.preco_unitario,
      precoTotal: best.preco_total ?? best.kitQty * best.preco_unitario,
    };
  }

  // Fallback: ultimo kit da tabela
  const last = tabela[tabela.length - 1];
  return {
    faixa: `${qty} pecas`,
    precoUnit: last.preco_unitario,
    precoTotal: qty * last.preco_unitario,
  };
}

/**
 * Gera resposta sobre produto encontrado.
 * Agora usa contexto de intencao (dimensoes, uso, quantidade) para respostas mais precisas.
 */
export function buildProductReply(cat: CategoriaProduto, intent?: DetectedIntent): ManyChatResponse {
  // Espessura final: explicitThicknessMm > suggestedThicknessMm > default
  const effectiveThicknessMm = intent?.explicitThicknessMm ?? intent?.suggestedThicknessMm;

  // ---- Tatame 50x50 com variantes e tabela de preco ----
  if (cat.id === "tatame_50x50" && cat.variantes?.length) {
    // Escolher variante pela espessura (explicita > sugerida > default 10mm)
    const targetMm = effectiveThicknessMm ?? 10;
    const variante = cat.variantes.find((v) => v.espessura_mm === targetMm) ?? cat.variantes[0];

    // Se e pergunta de disponibilidade ("tem?"), NAO calcular quantidade automaticamente
    if (intent?.isAvailabilityQuestion && !intent?.dimensions && !intent?.quantity) {
      return buildAvailabilityReply50x50(cat, variante, intent);
    }

    // Se temos dimensoes do espaco, calcular pecas
    const pieces = intent?.dimensions?.totalPieces50x50 ?? intent?.quantity;

    if (pieces && pieces > 0) {
      const kit = findBestKit(variante.tabela_precos, pieces);
      const dimInfo = intent?.dimensions
        ? `Pra um espaco de ${intent.dimensions.widthM}x${intent.dimensions.heightM}m, voce vai precisar de *${pieces} pecas* 📐`
        : `Pra *${pieces} pecas*:`;

      const useCaseInfo = intent?.useCase
        ? getUseCaseLabel(intent.useCase, variante.espessura_mm)
        : `O de ${variante.espessura_mm}mm e ideal pra ${variante.uso_recomendado}.`;

      const reply = [
        `Opa! Temos sim! 😊`,
        ``,
        useCaseInfo,
        ``,
        dimInfo,
        `👉 *R$ ${kit.precoUnit.toFixed(2)}* cada (${kit.faixa})`,
        `👉 *Total: R$ ${kit.precoTotal.toFixed(2)}*`,
        ``,
        `Temos ${variante.cores_disponiveis.length} cores disponiveis!`,
        variante.cores_em_falta.length ? `(${variante.cores_em_falta.join(", ")} em falta no momento)` : "",
        ``,
        `Quer que eu sugira uma combinacao de cores? Ou prefere tudo de uma cor so?`,
      ].filter(Boolean).join("\n");

      return {
        reply,
        action: "reply",
        add_tags: ["lead_qualificado"],
        set_fields: { quantidade_pecas: pieces, espessura_mm: variante.espessura_mm },
        _debug: { matched_intent: "produto_tatame_50x50_calculado", source: "catalogo", confidence: "high" },
      };
    }

    // Sem dimensoes e sem disponibilidade — resposta consultiva
    const useCaseInfo = intent?.useCase
      ? getUseCaseLabel(intent.useCase, variante.espessura_mm)
      : `O de ${variante.espessura_mm}mm e ideal pra ${variante.uso_recomendado}.`;

    const kitSugerido = variante.tabela_precos.find((t) => t.faixa === "Kit 12");
    const avulso = variante.tabela_precos[0];

    const reply = [
      `Opa! Temos sim o ${cat.nome} 😊`,
      ``,
      useCaseInfo,
      `👉 Avulso: R$ ${avulso.preco_unitario.toFixed(2)} cada`,
      kitSugerido
        ? `👉 Kit 12: R$ ${kitSugerido.preco_total?.toFixed(2)} (R$ ${kitSugerido.preco_unitario.toFixed(2)} cada — compensa mais!)`
        : "",
      ``,
      `Temos ${variante.cores_disponiveis.length} cores disponiveis.`,
      variante.cores_em_falta.length ? `(${variante.cores_em_falta.join(", ")} em falta no momento)` : "",
      ``,
      `Qual o tamanho do seu espaco? Posso calcular certinho quantas pecas voce precisa! 📐`,
    ].filter(Boolean).join("\n");

    return {
      reply,
      action: "reply",
      add_tags: ["lead_qualificado"],
      _debug: { matched_intent: "produto_tatame_50x50", source: "catalogo", confidence: "high" },
    };
  }

  // ---- Tatame 1x1m (profissional) ----
  if (cat.id === "tatame_1x1m" && cat.variantes?.length) {
    // Espessura: explicita > sugerida > default 30mm
    const targetMm = effectiveThicknessMm ?? 30;
    const variante = cat.variantes.find((v) => v.espessura_mm === targetMm)
      ?? cat.variantes.find((v) => v.espessura_mm >= targetMm)
      ?? cat.variantes[cat.variantes.length - 1]; // fallback: ultima variante (maior espessura)

    // Se e pergunta de disponibilidade ("tem?"), NAO calcular quantidade
    if (intent?.isAvailabilityQuestion && !intent?.quantity) {
      return buildAvailabilityReply1x1(cat, variante, intent);
    }

    const qty = intent?.quantity ?? (intent?.dimensions
      ? Math.ceil(intent.dimensions.widthM) * Math.ceil(intent.dimensions.heightM)
      : undefined);

    const useCaseInfo = intent?.useCase
      ? getUseCaseLabel(intent.useCase, variante.espessura_mm)
      : `O de ${variante.espessura_mm}mm e ${(variante as any).uso_recomendado}.`;

    const lines = [
      `Opa! Temos o Tatame Profissional 1x1m 💪`,
      ``,
      useCaseInfo,
      `👉 *R$ ${(variante as any).preco_unitario?.toFixed(2) ?? "consulte"}* cada peca (1m²)`,
    ];

    if (qty && qty > 0) {
      const total = qty * ((variante as any).preco_unitario ?? 0);
      lines.push(`👉 *${qty} pecas = R$ ${total.toFixed(2)}*`);
    }

    lines.push(
      ``,
      `Cores: ${(variante as any).cores_disponiveis?.join(", ") ?? "consulte"}`,
    );

    if ((variante as any).restricoes?.length) {
      lines.push(`⚠️ ${(variante as any).restricoes.join(". ")}`);
    }

    if ((variante as any).frete_especial) {
      lines.push(`🚚 ${(variante as any).frete_especial}`);
    }

    lines.push(``, `Quantas pecas voce precisa?`);

    return {
      reply: lines.filter(Boolean).join("\n"),
      action: "reply",
      add_tags: ["lead_qualificado"],
      _debug: { matched_intent: "produto_tatame_1x1m", source: "catalogo", confidence: "high" },
    };
  }

  // ---- Produtos simples (Kids, rolos, etc) ----
  if (cat.produtos?.length) {
    const items = cat.produtos.slice(0, 3);
    const lines = items.map((p) => {
      const preco = p.preco ?? (cat as any).preco_unico;
      return `👉 ${p.modelo}: R$ ${preco?.toFixed(2) ?? "consulte"} — ${p.argumento_comercial ?? p.argumento ?? ""}`;
    });

    const reply = [`Temos sim! ${cat.nome} 🎉`, ``, ...lines, ``, `Qual te interessa?`].join("\n");

    return {
      reply,
      action: "reply",
      add_tags: ["lead_qualificado"],
      _debug: { matched_intent: `produto_${cat.id}`, source: "catalogo", confidence: "high" },
    };
  }

  return {
    reply: `Temos ${cat.nome}! Quer que eu te mostre as opcoes e precos?`,
    action: "reply",
    _debug: { matched_intent: `produto_${cat.id}`, source: "catalogo", confidence: "medium" },
  };
}

/**
 * Resposta de disponibilidade para tatame 50x50.
 * Usada quando o cliente pergunta "Tem tatame 50x50 20mm?" — sem calcular quantidade.
 */
function buildAvailabilityReply50x50(
  cat: CategoriaProduto,
  variante: any,
  intent?: DetectedIntent
): ManyChatResponse {
  const avulso = variante.tabela_precos[0];
  const kitSugerido = variante.tabela_precos.find((t: any) => t.faixa === "Kit 12");

  const reply = [
    `Temos sim! 😊 Tatame ${cat.nome} de *${variante.espessura_mm}mm* disponivel!`,
    ``,
    `👉 Avulso: *R$ ${avulso.preco_unitario.toFixed(2)}* cada`,
    kitSugerido
      ? `👉 Kit 12: *R$ ${kitSugerido.preco_total?.toFixed(2)}* (R$ ${kitSugerido.preco_unitario.toFixed(2)} cada)`
      : "",
    ``,
    `Cores disponiveis: ${variante.cores_disponiveis.join(", ")}`,
    variante.cores_em_falta.length ? `(${variante.cores_em_falta.join(", ")} em falta no momento)` : "",
    ``,
    `Quantas pecas voce precisa? Se me passar o tamanho do espaco, calculo certinho! 📐`,
  ].filter(Boolean).join("\n");

  return {
    reply,
    action: "reply",
    add_tags: ["lead_qualificado"],
    set_fields: { espessura_mm: variante.espessura_mm },
    _debug: { matched_intent: "produto_tatame_50x50_disponibilidade", source: "catalogo", confidence: "high" },
  };
}

/**
 * Resposta de disponibilidade para tatame 1x1m.
 * Usada quando o cliente pergunta "Tem tatame 1x1 20mm?" — sem calcular quantidade.
 */
function buildAvailabilityReply1x1(
  cat: CategoriaProduto,
  variante: any,
  intent?: DetectedIntent
): ManyChatResponse {
  const reply = [
    `Temos sim! 😊 Tatame 1x1m de *${variante.espessura_mm}mm* disponivel!`,
    ``,
    `👉 *R$ ${(variante as any).preco_unitario?.toFixed(2) ?? "consulte"}* cada peca (1m²)`,
    ``,
    `Cores disponiveis: ${(variante as any).cores_disponiveis?.join(", ") ?? "consulte"}`,
    (variante as any).restricoes?.length ? `⚠️ ${(variante as any).restricoes.join(". ")}` : "",
    (variante as any).frete_especial ? `🚚 ${(variante as any).frete_especial}` : "",
    ``,
    `Quantas pecas voce precisa? 💪`,
  ].filter(Boolean).join("\n");

  return {
    reply,
    action: "reply",
    add_tags: ["lead_qualificado"],
    set_fields: { espessura_mm: variante.espessura_mm },
    _debug: { matched_intent: "produto_tatame_1x1m_disponibilidade", source: "catalogo", confidence: "high" },
  };
}

/**
 * Gera label descritivo do caso de uso + espessura.
 */
function getUseCaseLabel(useCase: string, thicknessMm: number): string {
  switch (useCase) {
    case "bebe":
      return `Pro *bebe*, o de ${thicknessMm}mm e perfeito! ${thicknessMm <= 10 ? "Protege do chao frio e dos joelhinhos na fase de engatinhar." : "Mais macio, otimo pra quando o bebe ja senta e brinca."}`;
    case "escola":
      return `Pra *escola/sala de aula*, o de ${thicknessMm}mm da conta! Resistente e facil de limpar.`;
    case "academia":
      return `Pra *academia/funcional*, recomendo o de ${thicknessMm}mm (1x1m). Absorve impacto e suporta treino pesado.`;
    case "artes_marciais":
      return `Pra *artes marciais*, o minimo seguro e ${thicknessMm}mm (1x1m). Absorve quedas com seguranca! 🥋`;
    case "playground":
      return `Pra *area de brincadeira*, o de ${thicknessMm}mm absorve impacto de pulos e corrida. Seguro pros pequenos!`;
    case "ambiente":
      return `O de ${thicknessMm}mm e o mais indicado pra forrar o ambiente. Protege e deixa confortavel!`;
    default:
      return `O de ${thicknessMm}mm e ideal pra esse uso.`;
  }
}
