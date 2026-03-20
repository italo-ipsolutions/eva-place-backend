/**
 * Classificador de intencao leve.
 * Roda ANTES do pipeline para decidir a ordem de prioridade dos matchers.
 * Evita contaminacao cruzada (ex: memoria de produto poluindo resposta de frete).
 */

export type IntentType = "frete" | "produto" | "pagamento" | "saudacao" | "faq" | "geral";

export interface DetectedIntent {
  primary: IntentType;
  confidence: "high" | "medium" | "low";
  /** Dimensoes do espaco, se detectadas (ex: "4x3" -> 4m x 3m) */
  dimensions?: { widthM: number; heightM: number; totalPieces50x50: number };
  /** Caso de uso detectado (bebe, jiu-jitsu, escola, etc.) */
  useCase?: string;
  /** Espessura sugerida com base no uso */
  suggestedThicknessMm?: number;
  /** Quantidade de pecas mencionada (ex: "12 pecas") */
  quantity?: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ---- Padroes de frete ----
const FRETE_PATTERNS: RegExp[] = [
  /\bfrete\b/,
  /\bentrega\b/,
  /\benvio\b/,
  /\bmotoboy\b/,
  /\bretirada\b/,
  /\bretirar\b/,
  /\bbuscar\b/,
  /\bzona\b/,
  /\bvalor\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\bquanto\s*(custa|e|fica|sai)\s*(a|o)?\s*(entrega|frete)\b/,
  /\bqual\s*(e|o)?\s*(valor|preco|custo)\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\bpreco\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\bcusto\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\btaxa\s*(de)?\s*entrega\b/,
  /\bentrega\s+pra\b/,
  /\bentreg(a|am)\s+(em|pra|para|no|na)\b/,
];

// ---- Padroes de produto ----
const PRODUTO_PATTERNS: RegExp[] = [
  /\btatame\b/,
  /\btapete\s*(eva|de encaixe)?\b/,
  /\beva\b/,
  /\bpiso\s*eva\b/,
  /\b50\s*x\s*50\b/,
  /\b1\s*x\s*1\s*m?\b/,
  /\bquero\s*(comprar|um|uma|o|a)?\b/,
  /\bprecis[oa]\b/,
  /\btem\s*(tatame|tapete|piso)\b/,
  /\bpreco\s*(do|da|de)?\s*(tatame|tapete|piso)\b/,
  /\bquant[oa]\s*(custa|e|fica|sai)\s*(o|a)?\s*(tatame|tapete|piso)\b/,
  /\bvalor\s*(do|da|de)?\s*(tatame|tapete|piso)\b/,
  /\byoga\b/,
  /\bflutuante\b/,
  /\bstep\b/,
  /\bprancha\b/,
  /\bcantoneira\b/,
  /\bamarelinha\b/,
  /\balfabeto\b/,
];

// ---- Padroes de pagamento ----
const PAGAMENTO_PATTERNS: RegExp[] = [
  /\bpix\b/,
  /\bparcela(r|mento|s)?\b/,
  /\bcartao\b/,
  /\bpagamento\b/,
  /\bformas?\s*(de)?\s*pag(ar|amento)\b/,
  /\bdesconto\b/,
  /\bboleto\b/,
  /\bquantas\s*vezes\b/,
];

// ---- Padroes de saudacao ----
const SAUDACAO_PATTERNS: RegExp[] = [
  /^(oi|ola|bom\s*dia|boa\s*tarde|boa\s*noite|eai|e\s*ai|hey|hello|hi|opa)\b/,
];

// ---- Deteccao de dimensoes (ex: "4x3", "4 por 3", "4mx3m") ----
const DIMENSION_REGEX = /(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:x|por)\s*(\d+(?:[.,]\d+)?)\s*(?:m(?:etros?)?)?\b/i;

// ---- Deteccao de quantidade (ex: "12 pecas", "quero 20") ----
const QUANTITY_REGEX = /\b(\d+)\s*(?:pecas?|unidades?|placas?|tatames?|pecas)\b/i;
const QUANTITY_PREFIX_REGEX = /\bquer[oa]?\s+(\d+)\b/i;

// ---- Mapeamento de uso -> espessura ----
const USE_CASE_MAP: Array<{ patterns: RegExp[]; useCase: string; thicknessMm: number; productSize: "50x50" | "1x1" }> = [
  {
    patterns: [/\bbeb[eê]\b/, /\bengatinha/,  /\bnem[eê]m\b/, /\binfantil\b/, /\bcrianca\b/],
    useCase: "bebe",
    thicknessMm: 10,
    productSize: "50x50",
  },
  {
    patterns: [/\bescola\b/, /\bpedagogic[oa]\b/, /\bsala\s*de\s*aula\b/],
    useCase: "escola",
    thicknessMm: 10,
    productSize: "50x50",
  },
  {
    patterns: [/\bacademia\b/, /\bpilates\b/, /\bfuncional\b/, /\bginastica\b/],
    useCase: "academia",
    thicknessMm: 20,
    productSize: "1x1",
  },
  {
    patterns: [/\bjiu[\s-]*jitsu\b/, /\bjudo\b/, /\bkarate\b/, /\bluta\b/, /\bdojo\b/, /\barte\s*marcial\b/],
    useCase: "artes_marciais",
    thicknessMm: 30,
    productSize: "1x1",
  },
  {
    patterns: [/\bplayground\b/, /\bpular\b/, /\bcorrer\b/, /\bbrincar\b/, /\bbrincadeira\b/, /\bparquinho\b/],
    useCase: "playground",
    thicknessMm: 20,
    productSize: "50x50",
  },
  {
    patterns: [/\bquarto\b/, /\bsala\b/, /\bespaco\b/],
    useCase: "ambiente",
    thicknessMm: 10,
    productSize: "50x50",
  },
];

function countMatches(q: string, patterns: RegExp[]): number {
  return patterns.filter((p) => p.test(q)).length;
}

/**
 * Extrai dimensoes do espaco mencionadas na mensagem.
 * "4x3" → 4m x 3m → 48 pecas de 50x50cm (8 colunas x 6 linhas)
 */
function parseDimensions(q: string): DetectedIntent["dimensions"] | undefined {
  const match = q.match(DIMENSION_REGEX);
  if (!match) return undefined;

  const w = parseFloat(match[1].replace(",", "."));
  const h = parseFloat(match[2].replace(",", "."));

  // Ignorar dimensoes absurdas (> 20m) ou muito pequenas (< 0.5m)
  if (w < 0.5 || h < 0.5 || w > 20 || h > 20) return undefined;

  // Cada tatame 50x50cm = 0.5m. Pecas por direcao = metros * 2
  const cols = Math.ceil(w * 2);
  const rows = Math.ceil(h * 2);
  return { widthM: w, heightM: h, totalPieces50x50: cols * rows };
}

/**
 * Extrai quantidade de pecas mencionada na mensagem.
 */
function parseQuantity(q: string): number | undefined {
  const match = q.match(QUANTITY_REGEX) || q.match(QUANTITY_PREFIX_REGEX);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  return n > 0 && n < 1000 ? n : undefined;
}

/**
 * Detecta caso de uso (bebe, academia, etc.)
 */
function detectUseCase(q: string): { useCase: string; thicknessMm: number } | undefined {
  for (const entry of USE_CASE_MAP) {
    if (entry.patterns.some((p) => p.test(q))) {
      return { useCase: entry.useCase, thicknessMm: entry.thicknessMm };
    }
  }
  return undefined;
}

/**
 * Classifica a intencao principal da mensagem.
 */
export function detectIntent(message: string): DetectedIntent {
  const q = normalize(message);

  // Saudacao (so se for inicio de frase e curta)
  if (q.length < 30 && SAUDACAO_PATTERNS.some((p) => p.test(q))) {
    // Se tem mais conteudo alem da saudacao, nao e so saudacao
    const withoutGreeting = q.replace(SAUDACAO_PATTERNS[0], "").trim();
    if (withoutGreeting.length < 5) {
      return { primary: "saudacao", confidence: "high" };
    }
  }

  const freteScore = countMatches(q, FRETE_PATTERNS);
  const produtoScore = countMatches(q, PRODUTO_PATTERNS);
  const pagamentoScore = countMatches(q, PAGAMENTO_PATTERNS);

  const dimensions = parseDimensions(q);
  const quantity = parseQuantity(q);
  const useCaseResult = detectUseCase(q);

  // Regra explicita: "valor do frete" / "qual o frete" → FRETE, mesmo que tenha "valor"
  // A palavra "valor" sozinha NAO deve ser frete
  if (freteScore > 0 && produtoScore === 0) {
    return {
      primary: "frete",
      confidence: freteScore >= 2 ? "high" : "medium",
      dimensions,
      quantity,
      useCase: useCaseResult?.useCase,
      suggestedThicknessMm: useCaseResult?.thicknessMm,
    };
  }

  // Se tem frete E produto mencionados, prioriza frete (ex: "quanto custa o frete do tatame")
  if (freteScore > 0 && produtoScore > 0) {
    // Se a frase fala MAIS de frete (ex: "qual o valor do frete"), prioriza frete
    if (freteScore >= produtoScore) {
      return {
        primary: "frete",
        confidence: "high",
        dimensions,
        quantity,
        useCase: useCaseResult?.useCase,
        suggestedThicknessMm: useCaseResult?.thicknessMm,
      };
    }
  }

  // Pagamento
  if (pagamentoScore > 0 && produtoScore === 0 && freteScore === 0) {
    return { primary: "pagamento", confidence: pagamentoScore >= 2 ? "high" : "medium" };
  }

  // Produto (inclui dimensoes/uso como reforco)
  if (produtoScore > 0 || dimensions || useCaseResult) {
    return {
      primary: "produto",
      confidence: produtoScore >= 2 || dimensions ? "high" : "medium",
      dimensions,
      quantity,
      useCase: useCaseResult?.useCase,
      suggestedThicknessMm: useCaseResult?.thicknessMm,
    };
  }

  return { primary: "geral", confidence: "low" };
}
