import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY nao configurada. Copie .env.example para .env e preencha."
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Modelo para chat/texto/visao */
export function getTextModel(): string {
  return process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";
}

/** Modelo para transcricao de audio */
export function getTranscribeModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
}
