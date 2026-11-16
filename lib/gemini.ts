import { logger } from './logger';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error('GEMINI_API_KEY não está configurada. Verifique seu arquivo .env.local');
}

interface ModelListResponse {
  models?: { name: string; supportedGenerationMethods?: string[] }[];
}

// Função para listar modelos disponíveis
async function listAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );
    
    if (!response.ok) {
      logger.warn('Could not list models, using default list.');
      return ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
    }

    const data: ModelListResponse = await response.json();
    const models = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace('models/', ''));

    return models.length > 0 ? models : ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
  } catch {
    logger.warn('Error listing models, using default list.');
    return ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
  }
}

// Função para gerar conteúdo usando API REST diretamente
async function generateWithModel(modelName: string, prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Erro ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Resposta vazia da API';
}

export async function generateStudyPlan(
  subject: string,
  hoursPerDay: number,
  days: number = 7
): Promise<string> {
  const prompt = `Você é um especialista em educação e criação de planos de estudos personalizados.

Crie um plano de estudos detalhado de ${days} dias para aprender "${subject}".

Informações:
- Assunto: ${subject}
- Horas por dia: ${hoursPerDay}h
- Total de dias: ${days}

O plano deve ser estruturado da seguinte forma:

Dia 1: [Título do dia]
- Objetivo: [objetivo do dia]
- Conteúdo: [o que será estudado]
- Links sugeridos: [links úteis se houver]
- Exercícios práticos: [sugestões de exercícios]

Dia 2: [Título do dia]
...

Continue até o Dia ${days}.

IMPORTANTE:
- Seja específico e prático
- Progressão gradual do básico ao avançado
- Inclua links úteis quando relevante (documentação oficial, tutoriais, etc.)
- Sugira exercícios práticos para cada dia
- Use emojis para tornar mais visual (📚, 🎯, 🔗, 💻, etc.)
- Formate em markdown com títulos, listas e destaques

Gere APENAS o plano de estudos, sem explicações adicionais.`;

  // Lista de modelos para tentar (em ordem de preferência)
  const modelsToTry = await listAvailableModels();
  
  let lastError: Error | null = null;
  
  for (const modelName of modelsToTry) {
    try {
      logger.info(`Trying model: ${modelName}`);
      const result = await generateWithModel(modelName, prompt);
      logger.info(`Model ${modelName} succeeded`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.warn(`Model ${modelName} failed: ${errorMessage}`);
      lastError = error instanceof Error ? error : new Error(errorMessage);
      // Tenta o próximo modelo
      continue;
    }
  }
  
  // Se nenhum modelo funcionou, lança o último erro
  throw new Error(
    lastError?.message || 
    'Nenhum modelo Gemini disponível. Verifique sua API key e os modelos disponíveis.'
  );
}
