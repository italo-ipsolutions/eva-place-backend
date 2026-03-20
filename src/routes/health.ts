import type { FastifyInstance } from "fastify";
import { getContext } from "../lib/context-loader.js";
import { getMemoryStats } from "../lib/memory.js";
import { isOpenAIConfigured } from "../lib/openai-client.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    try {
      const ctx = getContext();
      const mem = getMemoryStats();
      return reply.send({
        status: "ok",
        service: "eva-place-backend",
        context_loaded: true,
        context_loaded_at: ctx.loadedAt.toISOString(),
        openai_configured: isOpenAIConfigured(),
        webhook_auth: !!process.env.WEBHOOK_SECRET,
        stats: {
          categorias_produto: ctx.catalogo.categorias.length,
          zonas_frete: ctx.frete.zonas.length,
          perguntas_faq: ctx.faq.perguntas.length,
          fatores_parcela: ctx.regras.parcelamento.fatores.length,
        },
        memory: mem,
      });
    } catch {
      return reply.status(503).send({
        status: "error",
        context_loaded: false,
        message: "Base de contexto nao carregada",
      });
    }
  });
}
