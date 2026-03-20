/**
 * Cliente WooCommerce REST API v3.
 * Usa autenticacao via query string (consumer_key / consumer_secret).
 * Nao depende de pacote externo — usa fetch nativo do Node 18+.
 */

export interface WooConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

// ---------- Tipos retornados pela API WooCommerce ----------

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
}

export interface WooAttribute {
  id: number;
  name: string;
  slug: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

export interface WooImage {
  id: number;
  src: string;
  name: string;
  alt: string;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: "simple" | "variable" | "grouped" | "external";
  status: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  description: string;
  short_description: string;
  categories: WooCategory[];
  attributes: WooAttribute[];
  variations: number[];
  images: WooImage[];
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  manage_stock: boolean;
  weight: string;
  dimensions: { length: string; width: string; height: string };
  meta_data: Array<{ key: string; value: string }>;
}

export interface WooVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  manage_stock: boolean;
  attributes: Array<{ id: number; name: string; option: string }>;
  image?: WooImage;
  weight: string;
}

// ---------- Cliente ----------

export class WooCommerceClient {
  private baseUrl: string;
  private ck: string;
  private cs: string;

  constructor(config: WooConfig) {
    // Remove trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.ck = config.consumerKey;
    this.cs = config.consumerSecret;
  }

  /** Monta URL com autenticacao via query string */
  private url(endpoint: string, params: Record<string, string | number> = {}): string {
    const url = new URL(`${this.baseUrl}/wp-json/wc/v3${endpoint}`);
    url.searchParams.set("consumer_key", this.ck);
    url.searchParams.set("consumer_secret", this.cs);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  /** Fetch generico com retry simples */
  private async fetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    const fullUrl = this.url(endpoint, params);
    const maxRetries = 2;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(fullUrl);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`WooCommerce API ${res.status}: ${body.slice(0, 300)}`);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err as Error;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  /** Busca todos os produtos publicados (pagina automaticamente) */
  async getAllProducts(): Promise<WooProduct[]> {
    const perPage = 100;
    let page = 1;
    const all: WooProduct[] = [];

    while (true) {
      const batch = await this.fetch<WooProduct[]>("/products", {
        per_page: perPage,
        page,
        status: "publish",
      });
      all.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    return all;
  }

  /** Busca variacoes de um produto (pagina automaticamente) */
  async getVariations(productId: number): Promise<WooVariation[]> {
    const perPage = 100;
    let page = 1;
    const all: WooVariation[] = [];

    while (true) {
      const batch = await this.fetch<WooVariation[]>(`/products/${productId}/variations`, {
        per_page: perPage,
        page,
      });
      all.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    return all;
  }

  /** Busca categorias */
  async getCategories(): Promise<WooCategory[]> {
    return this.fetch<WooCategory[]>("/products/categories", { per_page: 100 });
  }

  /** Teste rapido de conexao */
  async testConnection(): Promise<boolean> {
    try {
      const cats = await this.fetch<WooCategory[]>("/products/categories", { per_page: 1 });
      return Array.isArray(cats);
    } catch {
      return false;
    }
  }
}

// ---------- Factory ----------

/** Cria cliente a partir de variaveis de ambiente */
export function createWooClientFromEnv(): WooCommerceClient {
  const baseUrl = process.env.WOOCOMMERCE_BASE_URL;
  const ck = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const cs = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!baseUrl || !ck || !cs) {
    throw new Error(
      "Variaveis WooCommerce nao configuradas. Defina WOOCOMMERCE_BASE_URL, WOOCOMMERCE_CONSUMER_KEY e WOOCOMMERCE_CONSUMER_SECRET no .env"
    );
  }

  return new WooCommerceClient({ baseUrl, consumerKey: ck, consumerSecret: cs });
}
