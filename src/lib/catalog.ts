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

/** Busca categorias/produtos que casam com a mensagem */
export function findProduct(message: string): CategoriaProduto | null {
  const ctx = getContext();
  const q = normalize(message);

  // Mapeamento de termos comuns para IDs de categoria
  const termMap: Record<string, string[]> = {
    tatame_50x50: ["tatame", "tapete eva", "50x50", "bebe", "engatinhar", "piso eva"],
    tatame_1x1m: ["1x1", "profissional", "jiu-jitsu", "jiu jitsu", "jiujitsu", "judo", "karate", "dojo", "luta", "arte marcial", "artes marciais"],
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
  // ---- Tatame 50x50 com variantes e tabela de preco ----
  if (cat.id === "tatame_50x50" && cat.variantes?.length) {
    // Escolher variante pela espessura sugerida, ou default 10mm
    const targetMm = intent?.suggestedThicknessMm ?? 10;
    const variante = cat.variantes.find((v) => v.espessura_mm === targetMm) ?? cat.variantes[0];

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

    // Sem dimensoes — resposta consultiva mas mais rica que antes
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
    const targetMm = intent?.suggestedThicknessMm ?? 30;
    const variante = cat.variantes.find((v) => v.espessura_mm >= targetMm) ?? cat.variantes[2]; // default 30mm

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
