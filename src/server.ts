import "dotenv/config";
import Fastify from "fastify";
import { loadContext } from "./lib/context-loader.js";
import { healthRoutes } from "./routes/health.js";
import { manychatRoutes } from "./routes/manychat.js";
import { manychatDynamicRoutes } from "./routes/manychat-dynamic.js";
import { whatsappMetaRoutes } from "./routes/whatsapp-meta.js";
import { isMetaWhatsAppConfigured } from "./lib/whatsapp-meta-client.js";

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
  await app.register(whatsappMetaRoutes);

  // Iniciar servidor
  await app.listen({ port: PORT, host: HOST });
  const metaConfigured = isMetaWhatsAppConfigured();
  console.log(`\n🚀 EVA PLACE Backend rodando em http://${HOST}:${PORT}`);
  console.log(`   GET  /health`);
  console.log(`   POST /webhooks/manychat/inbound    (ManyChat External Request — legado)`);
  console.log(`   POST /webhooks/manychat/dynamic    (ManyChat Dynamic Block)`);
  console.log(`   GET  /webhooks/whatsapp            (Meta verify — ${metaConfigured ? "✅ configurado" : "⚠️  sem credenciais"})`);
  console.log(`   POST /webhooks/whatsapp            (Meta inbound — ${metaConfigured ? "✅ configurado" : "⚠️  sem credenciais"})\n`);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
