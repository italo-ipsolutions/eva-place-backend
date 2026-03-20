import type { FastifyRequest, FastifyReply } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida o webhook com base em secret compartilhado.
 *
 * Estrategia dupla:
 * 1. Header `X-Webhook-Secret` — comparacao direta (ManyChat External Request)
 * 2. Header `X-Hub-Signature-256` — HMAC SHA-256 do body (padrao Meta/webhook)
 *
 * Se WEBHOOK_SECRET nao estiver configurado, aceita tudo (modo dev).
 */
export async function verifyWebhook(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const secret = process.env.WEBHOOK_SECRET;

  // Modo dev: sem secret = aceita tudo
  if (!secret) {
    return;
  }

  // Estrategia 1: Header simples (ManyChat External Request / JSON API Action)
  const headerSecret = req.headers["x-webhook-secret"] as string | undefined;
  if (headerSecret) {
    if (safeCompare(headerSecret, secret)) {
      return;
    }
    console.warn("[auth] X-Webhook-Secret invalido");
    reply.status(401).send({ error: "Webhook secret invalido" });
    return reply;
  }

  // Estrategia 2: HMAC signature (padrao Meta)
  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  if (signature) {
    const rawBody = JSON.stringify(req.body);
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    if (safeCompare(signature, expected)) {
      return;
    }
    console.warn("[auth] X-Hub-Signature-256 invalida");
    reply.status(401).send({ error: "Signature invalida" });
    return reply;
  }

  // Nenhum header de autenticacao presente
  console.warn("[auth] Request sem header de autenticacao");
  reply.status(401).send({ error: "Header de autenticacao ausente" });
  return reply;
}

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
