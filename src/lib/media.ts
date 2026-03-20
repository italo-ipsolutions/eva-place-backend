import { getOpenAIClient, getTranscribeModel, getTextModel } from "./openai-client.js";
import { buildVisionMessages } from "./prompt-builder.js";
import type { ManyChatResponse } from "../types/index.js";

/**
 * Transcreve audio a partir de uma URL.
 * Usa o modelo de transcricao configurado.
 * Retorna o texto transcrito.
 */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  const client = getOpenAIClient();
  const model = getTranscribeModel();

  console.log(`[media] Transcrevendo audio: ${audioUrl.slice(0, 80)}...`);

  // Baixar o audio da URL
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Falha ao baixar audio: ${audioResponse.status} ${audioResponse.statusText}`);
  }

  const audioBuffer = await audioResponse.arrayBuffer();
  const audioFile = new File([audioBuffer], "audio.ogg", { type: "audio/ogg" });

  const transcription = await client.audio.transcriptions.create({
    model,
    file: audioFile,
    language: "pt",
  });

  const text = transcription.text?.trim() ?? "";
  console.log(`[media] Transcricao: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`);
  return text;
}

/**
 * Analisa imagem usando modelo multimodal.
 * Envia a imagem com o contexto da EVA PLACE e retorna resposta formatada.
 */
export async function analyzeImage(
  imageUrl: string,
  userMessage?: string
): Promise<ManyChatResponse> {
  const client = getOpenAIClient();
  const model = getTextModel();

  console.log(`[media] Analisando imagem: ${imageUrl.slice(0, 80)}...`);

  const messages = buildVisionMessages(
    userMessage ?? "O cliente mandou essa imagem. Analise no contexto de produtos EVA e responda.",
    imageUrl
  );

  const completion = await client.chat.completions.create({
    model,
    messages,
    max_tokens: 500,
    temperature: 0.4,
  });

  const reply = completion.choices[0]?.message?.content?.trim();

  if (!reply) {
    return {
      reply: "Recebi a imagem mas nao consegui analisar. Vou chamar nosso atendente pra te ajudar!",
      action: "escalate",
      add_tags: ["escalar_humano"],
      _debug: { matched_intent: "image_analysis_failed", source: "openai_vision", confidence: "low" },
    };
  }

  return {
    reply,
    action: "reply",
    _debug: {
      matched_intent: "image_analysis",
      source: "openai_vision",
      confidence: "medium",
    },
  };
}
