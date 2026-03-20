import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CatalogoDB, FreteDB, FaqDB, RegrasNegocioDB } from "../types/index.js";

export interface ContextBase {
  catalogo: CatalogoDB;
  frete: FreteDB;
  faq: FaqDB;
  regras: RegrasNegocioDB;
  loadedAt: Date;
}

const FILES = {
  catalogo: "catalogo_produtos.json",
  frete: "regras_frete.json",
  faq: "faq.json",
  regras: "regras_negocio.json",
} as const;

let _ctx: ContextBase | null = null;

async function loadJson<T>(basePath: string, filename: string): Promise<T> {
  const fullPath = join(basePath, filename);
  const raw = await readFile(fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function loadContext(basePath?: string): Promise<ContextBase> {
  const base = resolve(basePath ?? process.env.CONTEXT_BASE_PATH ?? "./BACKEND_BASE");

  console.log(`[context-loader] Carregando base de contexto de: ${base}`);

  const [catalogo, frete, faq, regras] = await Promise.all([
    loadJson<CatalogoDB>(base, FILES.catalogo),
    loadJson<FreteDB>(base, FILES.frete),
    loadJson<FaqDB>(base, FILES.faq),
    loadJson<RegrasNegocioDB>(base, FILES.regras),
  ]);

  // Validacao basica
  if (!catalogo.categorias?.length) throw new Error("catalogo_produtos.json vazio ou invalido");
  if (!frete.zonas?.length) throw new Error("regras_frete.json sem zonas");
  if (!faq.perguntas?.length) throw new Error("faq.json sem perguntas");
  if (!regras.parcelamento?.fatores?.length) throw new Error("regras_negocio.json sem fatores de parcela");

  console.log(`[context-loader] Base carregada com sucesso:`);
  console.log(`  - ${catalogo.categorias.length} categorias de produto`);
  console.log(`  - ${frete.zonas.length} zonas de frete`);
  console.log(`  - ${faq.perguntas.length} perguntas no FAQ`);
  console.log(`  - ${regras.parcelamento.fatores.length} fatores de parcelamento`);

  _ctx = { catalogo, frete, faq, regras, loadedAt: new Date() };
  return _ctx;
}

export function getContext(): ContextBase {
  if (!_ctx) throw new Error("Contexto nao carregado. Chame loadContext() antes.");
  return _ctx;
}
