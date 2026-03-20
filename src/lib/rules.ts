import type { ManyChatResponse } from "../types/index.js";
import { isOpenAIConfigured, getOpenAIClient, getTextModel } from "./openai-client.js";
import { buildChatMessagesWithHistory } from "./prompt-builder.js";

/**
 * Fallback: quando nem matchers locais nem OpenAI resolvem.
 */
export function buildFallbackReply(): ManyChatResponse {
  return {
    reply: [
      `Opa! Deixa eu chamar nosso atendente pra te ajudar com isso, tudo bem?`,
      `So um minutinho que ja te respondo! 😉`,
    ].join("\n"),
    action: "escalate",
    add_tags: ["escalar_humano"],
    _debug: {
      matched_intent: "fallback",
      source: "rules",
      confidence: "low",
    },
  };
}

/**
 * Chama a OpenAI com a mensagem do cliente + contexto da base.
 * Retorna null se OpenAI nao estiver configurada (cai no fallback).
 */
export async function handleWithAI(
  message: string,
  subscriberId?: string
): Promise<ManyChatResponse | null> {
  if (!isOpenAIConfigured()) {
    console.log("[rules] OpenAI nao configurada, pulando para fallback");
    return null;
  }

  try {
    const client = getOpenAIClient();
    const model = getTextModel();

    const messages = buildChatMessagesWithHistory(message, subscriberId);

    console.log(`[rules] Chamando OpenAI (${model}), ${messages.length} msgs, para: "${message.slice(0, 60)}..."`);

    const completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.4,
    });

    const reply = completion?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.log("[rules] OpenAI retornou resposta vazia");
      return null;
    }

    // Detectar se o modelo sinalizou que nao sabe responder
    const lowerReply = reply.toLowerCase();
    const unsureSignals = [
      "nao tenho certeza",
      "nao sei informar",
      "vou acionar",
      "chamar o atendente",
      "nao consigo responder",
    ];

    if (unsureSignals.some((s) => lowerReply.includes(s))) {
      return {
        reply,
        action: "escalate",
        add_tags: ["escalar_humano"],
        _debug: {
          matched_intent: "ai_unsure",
          source: "openai",
          confidence: "low",
        },
      };
    }

    console.log(`[rules] OpenAI respondeu com sucesso (${reply.length} chars)`);

    return {
      reply,
      action: "reply",
      _debug: {
        matched_intent: "ai_response",
        source: "openai",
        confidence: "medium",
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[rules] Erro OpenAI: ${errorMsg}`);
    return null;
  }
}
