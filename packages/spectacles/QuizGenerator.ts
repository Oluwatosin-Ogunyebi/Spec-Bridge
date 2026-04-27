/**
 * QuizGenerator — AI-powered quiz question generation for Spectacles.
 *
 * Calls Claude (default), OpenAI, or Gemini via Snap's Remote Service Gateway
 * to generate multiple-choice questions from a spoken topic.
 *
 * @example
 * ```typescript
 * const gen = new QuizGenerator({
 *   remoteService: this.remoteService,
 *   provider: 'claude',
 * });
 * const quiz = await gen.generate({ topic: 'Greek mythology', count: 10, difficulty: 'medium' });
 * ```
 */

import {
  QuizGeneratorConfig,
  GenerateParams,
  QuizPayload,
  QuizQuestion,
  QuizGenerationError,
} from './types';

const TIMEOUT_MS = 10000;
const MAX_CACHE_SIZE = 5;
const MAX_RETRIES = 1;

export class QuizGenerator {
  private config: QuizGeneratorConfig;
  private cache: Map<string, QuizPayload> = new Map();
  private cacheOrder: string[] = [];

  constructor(config: QuizGeneratorConfig) {
    this.config = config;
  }

  /**
   * Generate quiz questions for a given topic.
   * Returns cached results if the same topic/count/difficulty was recently requested.
   */
  async generate(params: GenerateParams): Promise<QuizPayload> {
    const cacheKey = this.buildCacheKey(params);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      print('[QuizGenerator] Returning cached quiz for: ' + params.topic);
      return cached;
    }

    const prompt = this.buildPrompt(params);
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await this.callProvider(prompt);
        const quiz = this.parseAndValidate(raw, params);
        this.addToCache(cacheKey, quiz);
        return quiz;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          print(
            `[QuizGenerator] Attempt ${attempt + 1} failed, retrying: ${err}`
          );
        }
      }
    }

    throw new QuizGenerationError(
      `Failed to generate quiz after ${MAX_RETRIES + 1} attempts. ` +
        `Topic: "${params.topic}". Check your Remote Service Gateway config.`,
      lastError
    );
  }

  /** Build the prompt template for the AI provider. */
  private buildPrompt(params: GenerateParams): string {
    return `You are a quiz generator. Generate exactly ${params.count} multiple-choice questions on the topic: "${params.topic}". Difficulty: ${params.difficulty}.

Rules:
- Each question has exactly 4 choices, one of which is correct
- Questions must be factually accurate and verifiable
- Avoid trick questions, pop culture references after 2024, or anything requiring real-time data
- Mix question types: definition, comparison, history, application
- Keep questions under 120 characters
- Keep each choice under 60 characters

Respond with ONLY valid JSON in this exact format, no markdown, no preamble:

{
  "topic": "${params.topic}",
  "questions": [
    {
      "id": 1,
      "text": "Which year did X happen?",
      "choices": ["1990", "1995", "2000", "2005"],
      "correctIndex": 1,
      "explanation": "Brief one-sentence explanation"
    }
  ]
}`;
  }

  /**
   * Call the AI provider via Remote Service Gateway.
   * Returns the raw text response.
   */
  private callProvider(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new QuizGenerationError(
            'AI request timed out after ' + TIMEOUT_MS + 'ms'
          )
        );
      }, TIMEOUT_MS);

      try {
        const request = this.buildProviderRequest(prompt);

        this.config.remoteService.performApiRequest(
          request,
          (response: any) => {
            clearTimeout(timer);
            try {
              if (response.statusCode >= 400) {
                reject(
                  new QuizGenerationError(
                    `API returned status ${response.statusCode}: ${response.body}`
                  )
                );
                return;
              }
              resolve(response.body);
            } catch (err) {
              reject(
                new QuizGenerationError('Failed to read API response', err)
              );
            }
          }
        );
      } catch (err) {
        clearTimeout(timer);
        reject(
          new QuizGenerationError('Failed to call Remote Service Gateway', err)
        );
      }
    });
  }

  /** Build the provider-specific API request payload. */
  private buildProviderRequest(prompt: string): any {
    switch (this.config.provider) {
      case 'claude':
        return {
          url: 'https://api.anthropic.com/v1/messages',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        };

      case 'openai':
        return {
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        };

      case 'gemini':
        return {
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        };

      default:
        throw new QuizGenerationError(
          `Unsupported provider: ${this.config.provider}`
        );
    }
  }

  /** Parse raw AI response and validate the quiz structure. */
  private parseAndValidate(raw: string, params: GenerateParams): QuizPayload {
    // Extract JSON from the response — handle provider-specific wrappers
    const jsonStr = this.extractJson(raw);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      throw new QuizGenerationError(
        'AI returned invalid JSON. Response starts with: ' +
          jsonStr.slice(0, 100),
        err
      );
    }

    // Validate top-level shape
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new QuizGenerationError(
        'AI response missing "questions" array.'
      );
    }

    if (parsed.questions.length !== params.count) {
      throw new QuizGenerationError(
        `Expected ${params.count} questions, got ${parsed.questions.length}.`
      );
    }

    // Validate each question
    for (let i = 0; i < parsed.questions.length; i++) {
      this.validateQuestion(parsed.questions[i], i);
    }

    return {
      topic: parsed.topic || params.topic,
      questions: parsed.questions as QuizQuestion[],
    };
  }

  /** Validate a single question object. */
  private validateQuestion(q: any, index: number): void {
    const prefix = `Question ${index + 1}`;

    if (typeof q.id !== 'number') {
      throw new QuizGenerationError(`${prefix}: missing or invalid "id".`);
    }
    if (typeof q.text !== 'string' || q.text.length === 0) {
      throw new QuizGenerationError(`${prefix}: missing or empty "text".`);
    }
    if (!Array.isArray(q.choices) || q.choices.length !== 4) {
      throw new QuizGenerationError(
        `${prefix}: "choices" must be an array of exactly 4 strings.`
      );
    }
    for (let i = 0; i < 4; i++) {
      if (typeof q.choices[i] !== 'string' || q.choices[i].length === 0) {
        throw new QuizGenerationError(
          `${prefix}: choice[${i}] must be a non-empty string.`
        );
      }
    }
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
      throw new QuizGenerationError(
        `${prefix}: "correctIndex" must be 0-3.`
      );
    }
    if (typeof q.explanation !== 'string') {
      throw new QuizGenerationError(
        `${prefix}: missing "explanation" string.`
      );
    }
  }

  /**
   * Extract JSON from provider response body.
   * Claude wraps content in a messages array; OpenAI in choices; Gemini in candidates.
   */
  private extractJson(raw: string): string {
    try {
      const body = JSON.parse(raw);

      // Claude response format
      if (body.content && Array.isArray(body.content)) {
        const textBlock = body.content.find((b: any) => b.type === 'text');
        if (textBlock) return textBlock.text;
      }

      // OpenAI response format
      if (body.choices && body.choices[0]?.message?.content) {
        return body.choices[0].message.content;
      }

      // Gemini response format
      if (body.candidates && body.candidates[0]?.content?.parts) {
        return body.candidates[0].content.parts[0].text;
      }
    } catch {
      // raw might already be plain JSON — return as-is
    }

    // Strip markdown code fences if present
    const stripped = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
    return stripped.trim();
  }

  // -------------------------------------------------------------------------
  // LRU cache (5 items)
  // -------------------------------------------------------------------------

  private buildCacheKey(params: GenerateParams): string {
    return `${params.topic.toLowerCase().trim()}|${params.count}|${params.difficulty}`;
  }

  private addToCache(key: string, quiz: QuizPayload): void {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      this.cacheOrder = this.cacheOrder.filter((k) => k !== key);
    } else if (this.cache.size >= MAX_CACHE_SIZE) {
      // Evict oldest
      const oldest = this.cacheOrder.shift();
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, quiz);
    this.cacheOrder.push(key);
  }

  /** Clear the generation cache. */
  clearCache(): void {
    this.cache.clear();
    this.cacheOrder = [];
  }
}
