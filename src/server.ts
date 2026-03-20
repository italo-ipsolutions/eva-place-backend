import "dotenv/config";
import Fastify from "fastify";
import { loadContext } from "./lib/context-loader.js";
import { healthRoutes } from "./routes/health.js";
import { manychatRoutes } from "./routes/manychat.js";
import { manychatDynamicRoutes } from "./routes/manychat-dynamic.js";

const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || "0.0.0.0";

async function main() {
  const app = Fastify({ logger: false });

  // Carregar base de contexto antes de aceitar requests
  try {
    await loadContext();
  } catch (err) {
    console.error("[FATAL] Falha ao carregar base de contexto:", err);
    process.exit(1);
  }

  // Registrar rotas
  await app.register(healthRoutes);
  await app.register(manychatRoutes);
  await app.register(manychatDynamicRoutes);

  // Iniciar servidor
  await app.listen({ port: PORT, host: HOST });
  console.log(`\n🚀 EVA PLACE Backend rodando em http://${HOST}:${PORT}`);
  console.log(`   GET  /health`);
  console.log(`   POST /webhooks/manychat/inbound    (External Request — legado)`);
  console.log(`   POST /webhooks/manychat/dynamic    (Dynamic Block — recomendado)\n`);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
