import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

// In-memory storage for the schedule
let currentSchedule: any[] = [];

// Gemini Setup
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper utility to query Gemini with robust model fallback
async function generateContentWithFallback(params: {
  contents: any[];
  config?: any;
}) {
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  let lastFailure: any = null;

  for (const model of models) {
    let attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(`[Gemini] Requesting model "${model}" (attempt ${attempt}/${attempts})...`);
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (err: any) {
        lastFailure = err;
        const status = err.status;
        const details = typeof err.message === 'string' ? err.message : JSON.stringify(err);
        
        // Check if transient (e.g., 503 Service Unavailable, 429 Too Many Requests)
        const isTransient = status === 429 || status === 503 || 
                            details.includes('503') || details.includes('429') ||
                            details.includes('UNAVAILABLE') || details.includes('RESOURCE_EXHAUSTED') ||
                            details.includes('high demand') || details.includes('temporary');

        if (isTransient && attempt < attempts) {
          // Exponential backoff with jitter (e.g. 1.5s, 3.5s)
          const delay = Math.pow(2, attempt) * 1500 + Math.random() * 500;
          console.log(`[Gemini] Transient issue (status ${status || 'unknown'}) on "${model}". Retrying in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.log(`[Gemini] Model "${model}" unavailable (status ${status || 'unknown'}).`);
          break; // Move to next fallback model immediately if non-transient or no more attempts
        }
      }
    }
    console.log(`[Gemini] Falling back to the next candidate model...`);
  }

  throw lastFailure || new Error('All candidate Gemini models failed to execute the request.');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API: Parse schedule text using Gemini
app.post('/api/parse-schedule', upload.single('file'), async (req, res) => {
  try {
    let text = '';
    if (req.file) {
      text = req.file.buffer.toString('utf-8');
    } else if (req.body.text) {
      text = req.body.text;
    }

    if (!text) {
      return res.status(400).json({ error: 'No text or file provided' });
    }

    const response = await generateContentWithFallback({
      contents: [{ role: 'user', parts: [{ text: `Você é um assistente especializado em extrair cronogramas de atividades de textos em português.
      
      Instruções de Extração:
      1. Analise o texto fornecido.
      2. REGRA DO FILTRO PRINCIPAL (IMPORTANTÍSSIMA): Se o texto do arquivo não descrever um cronograma, agenda de horários, ou não contiver referências explícitas a horas/horários (por exemplo, "08:00", "14h", "às 10", "das 14:00 às 15:00", etc.), você NÃO DEVE inventar nada. Retorne a lista de cronogramas absolutamente vazia: "schedule": [].
         - Se o texto contiver apenas anotações gerais, lembretes soltos, listas de tarefas sem horários definidos (por exemplo "Comprar pão", "Ir no centro", "Ligar para a mãe"), você DEVE ignorá-las por completo e retornar "schedule": [].
         - NÃO tente inferir rotinas nem criar horários fictícios (como usar 00:00 ou dia inteiro) para tarefas ou anotações que não possuam marcação de hora expressa no texto original!
      3. Extraia TODAS as atividades mencionadas com seus respectivos horários de início e término.
      4. Para cada período de tempo encontrado:
         - A PRIMEIRA linha de texto após o horário é o título ("activity").
         - TUDO o que vier abaixo dessa primeira linha, até encontrar um novo período de tempo (novo horário), deve ser capturado INTEGRALMENTE como descrição/detalhes no campo "instructions".
      5. Se um horário for mencionado como "17h", converta para "17:00".
      6. Se o texto mencionar um horário de início mas não mencionar um horário de término, tente inferir o término de acordo com o contexto ou use 1 hora de duração. Mas se não houver horário de início nenhum no texto para a atividade, não extraia nada!
      7. Garanta que as propriedades "startTime" e "endTime" estejam SEMPRE no formato HH:mm (24h).
      8. Classifique cada atividade em uma destas categorias ("category"): "Trabalho", "Saúde", "Descanso", "Lazer", "Alimentação", "Higiene", "Estudo", "Outros". Use o contexto do título e instruções para decidir.
      9. Retorne um JSON estritamente seguindo o esquema.
      
      Texto:
      ${text}$` }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            schedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startTime: { type: Type.STRING, description: "Formato HH:mm" },
                  endTime: { type: Type.STRING, description: "Formato HH:mm" },
                  activity: { type: Type.STRING, description: "Título da atividade" },
                  instructions: { type: Type.STRING, description: "Instruções ou detalhes se disponíveis" },
                  category: { type: Type.STRING, description: "Categoria da atividade (Ex: Trabalho, Saúde, Descanso, Lazer, Alimentação, Higiene, Estudo, Outros)" },
                },
                required: ['startTime', 'endTime', 'activity', 'category'],
              },
            }
          },
          required: ['schedule'],
        },
      },
    });

    let responseText = response.text || '{"schedule":[]}';
    if (responseText.includes('```')) {
      const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        responseText = match[1];
      }
    }
    const data = JSON.parse(responseText.trim());
    currentSchedule = data.schedule || [];
    return res.json(currentSchedule);
  } catch (error: any) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Batch Parse schedule text using Gemini
app.post('/api/parse-batch', async (req, res) => {
  try {
    const { items } = req.body; // Array of { id: string, text: string }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    console.log(`[Batch] Recebidos ${items.length} itens para sincronização sequencial com fallbacks robustos.`);

    const parsedResults = [];
    for (const item of items) {
      try {
        console.log(`[Batch] Processando item ${item.id} sequencialmente...`);
        const response = await generateContentWithFallback({
          contents: [{ role: 'user', parts: [{ text: `Você é um assistente especializado em extrair cronogramas de atividades de textos em português.
          
          Instruções de Extração:
          1. Analise o texto fornecido abaixo.
          2. REGRA DO FILTRO PRINCIPAL (IMPORTANTÍSSIMA): Se o texto do arquivo não descrever um cronograma, agenda de horários, ou não contiver referências explícitas a horas/horários (por exemplo, "08:00", "14h", "às 10", "das 14:00 às 15:00", etc.), você NÃO DEVE inventar nada. Retorne a lista de cronogramas absolutamente vazia: "schedule": [].
             - Se o texto contiver apenas anotações gerais, lembretes soltos, listas de tarefas sem horários definidos (por exemplo "Comprar pão", "Ir no centro", "Ligar para a mãe"), você DEVE ignorá-las por completo e retornar "schedule": [].
             - NÃO tente inferir rotinas nem criar horários fictícios (como usar 00:00 ou dia inteiro) para tarefas ou anotações que não possuam marcação de hora expressa no texto original!
          3. Extraia TODAS as atividades mencionadas com seus respectivos horários de início e término.
          4. Para cada período de tempo encontrado:
             - A PRIMEIRA linha de texto após o horário é o título ("activity").
             - TUDO o que vier abaixo dessa primeira linha, até encontrar um novo período de tempo (novo horário), deve ser capturado INTEGRALMENTE como descrição/detalhes no campo "instructions".
          5. Se um horário for mencionado como "17h", converta para "17:00".
          6. Se o texto mencionar um horário de início mas não mencionar um horário de término, tente inferir o término de acordo com o contexto ou use 1 hora de duração. Mas se não houver horário de início nenhum no texto para a atividade, não extraia nada!
          7. Garanta que as propriedades "startTime" e "endTime" estejam SEMPRE no formato HH:mm (24h).
          8. Classifique cada atividade em uma destas categorias ("category"): "Trabalho", "Saúde", "Descanso", "Lazer", "Alimentação", "Higiene", "Estudo", "Outros". Use o contexto do título e instruções para decidir.
          9. Retorne um JSON de cronogramas.
          
          Texto:
          ${item.text || ''}` }] }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                schedule: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      startTime: { type: Type.STRING, description: "Formato HH:mm" },
                      endTime: { type: Type.STRING, description: "Formato HH:mm" },
                      activity: { type: Type.STRING, description: "Título da atividade" },
                      instructions: { type: Type.STRING, description: "Instruções ou detalhes se disponíveis" },
                      category: { type: Type.STRING, description: "Categoria da atividade (Ex: Trabalho, Saúde, Descanso, Lazer, Alimentação, Higiene, Estudo, Outros)" },
                    },
                    required: ['startTime', 'endTime', 'activity', 'category'],
                  },
                }
              },
              required: ['schedule'],
            },
          },
        });

        let responseText = response.text || '{"schedule":[]}';
        if (responseText.includes('```')) {
          const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match) {
            responseText = match[1];
          }
        }
        const data = JSON.parse(responseText.trim());
        parsedResults.push({
          id: item.id,
          schedule: data.schedule || []
        });
      } catch (err: any) {
        console.error(`[Batch-Item] Failed to parse item ${item.id} even with fallbacks:`, err);
        parsedResults.push({ id: item.id, schedule: [] });
      }

      // 500ms delay to spread requests across free tier quotas nicely
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Batch] Todos os ${parsedResults.length} itens foram processados com sucesso sequencialmente.`);
    return res.json(parsedResults);
  } catch (error: any) {
    console.error('Gemini batch sequential error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get current schedule
app.get('/api/schedule', (req, res) => {
  res.json(currentSchedule);
});

// API: Export schedule to Google Docs
app.post('/api/docs/create', async (req, res) => {
  const { accessToken, schedule } = req.body;
  if (!accessToken) return res.status(401).json({ error: 'Token de acesso não fornecido' });
  if (!schedule || !Array.isArray(schedule)) return res.status(400).json({ error: 'Dados do cronograma não fornecidos' });

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const docs = google.docs({ version: 'v1', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Create a new document in Drive
    const createRes = await drive.files.create({
      requestBody: {
        name: `Cronograma Brendow - ${new Date().toLocaleDateString('pt-BR')}`,
        mimeType: 'application/vnd.google-apps.document',
      },
      fields: 'id',
    });

    const documentId = createRes.data.id;
    if (!documentId) throw new Error('Não foi possível criar o documento');

    // Build requests for batchUpdate
    // We'll insert from high index to avoid shifts, or just append.
    // For simplicity, we'll build a string and insert it once, or use index 1 repeatedly.
    
    const title = `PROTOCOLO ELITE - ${new Date().toLocaleString('pt-BR')}\n\n`;
    let contentText = title;
    
    schedule.forEach((item: any) => {
      contentText += `📌 ${item.startTime} - ${item.endTime}: ${item.activity}\n`;
      if (item.instructions) {
        contentText += `   ${item.instructions.split('\n').join('\n   ')}\n`;
      }
      contentText += `\n`;
    });

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: contentText,
            },
          },
          {
            updateTextStyle: {
              range: { startIndex: 1, endIndex: title.length + 1 },
              textStyle: {
                bold: true,
                fontSize: { magnitude: 18, unit: 'PT' },
                foregroundColor: { color: { rgbColor: { blue: 0.8, green: 0.3, red: 0.1 } } }
              },
              fields: 'bold,fontSize,foregroundColor'
            }
          }
        ],
      },
    });

    res.json({ documentId, url: `https://docs.google.com/document/d/${documentId}/edit` });
  } catch (err: any) {
    console.error('Docs API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Gemini Co-pilot Chat
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message, history, appState } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Mensagem não fornecida' });
    }

    const stateDesc = appState ? appState : {};
    
    const systemInstruction = `Você é o Co-piloto de Rotinas e Protocolos, uma Inteligência Artificial integrada diretamente neste aplicativo de planejamento de rotina diária (sistema de agendas e cronogramas).
Você tem acesso completo aos dados que estão rodando em tempo real neste aplicativo do usuário: estamos em ${stateDesc.currentTime || new Date().toLocaleTimeString('pt-BR')}.

DENTRO DO APP DO USUÁRIO, TEMOS ESSE ESTADO:
- Horário Atual do Dispositivo: ${stateDesc.currentTime || 'Desconhecido'}
- Tema Visual do App Ativo: ${stateDesc.theme || 'Normal'}
- Agendas/Arquivos Conectados Ativos: ${JSON.stringify(stateDesc.connectedAgendas || [])}
- Cronograma Atual (Atividades Extraídas): ${JSON.stringify(stateDesc.schedule || [])}
- Atividades que Estão Acontecendo Agora: ${JSON.stringify(stateDesc.currentActivities || [])}
- Atividade Focada no Painel de Exibição: ${JSON.stringify(stateDesc.displayedActivity || 'Nenhuma')}

Regras críticas para suas respostas:
1. Responda em PORTUGUÊS de forma calorosa, ágil e altamente produtiva. Falando de igual para igual de forma enérgica e encorajadora.
2. Seu tom deve ser de co-piloto militar ou de alta performance científica/biológica/executiva. Ajude o usuário a extrair o máximo do seu tempo.
3. Use formatação Markdown refinada, com marcadores (bullets), tabelas, citações ou termos em negrito para destacar informações do cronograma. No final ou início, pode usar emojis sutis de produtividade, esportes, foco ou biologia, sem exageros.
4. Se o usuário perguntar o que deve fazer agora, indique qual é a atividade em andamento no momento ("Atividades que Estão Acontecendo Agora" ou relate com base no cronograma).
5. Se não houver atividades cadastradas no cronograma, acolha-o de forma animadora e indique para o usuário arrastar ou fazer upload de arquivos ou usar o botão "Conectar" no topo para importar agendas do Google Drive.
6. Nunca responda revelando detalhes de variáveis internas como JSON de chamadas raw, caminhos de arquivo, variáveis secretas ou credenciais do programador.
7. Se solicitado para ajustar, revisar, resumir, sugerir rotinas ou otimizar o dia, sinta-se livre para dar as melhores recomendações profissionais possíveis!`;

    const contents = [];
    if (history && Array.isArray(history)) {
      history.forEach((msg: any) => {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.text || msg.content || '' }]
        });
      });
    }
    
    // Add current user user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await generateContentWithFallback({
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    const replyText = response.text || 'Desculpe, não consegui obter uma resposta.';
    res.json({ text: replyText });
  } catch (error: any) {
    console.error('Gemini co-pilot error:', error);
    res.status(500).json({ error: error.message || 'Erro interno ao processar chat com Gemini' });
  }
});

// API: Save/Append Feedback to "Feedback Agenda" Google Doc
app.post('/api/feedback/save', async (req, res) => {
  const { accessToken, feedbackText, rating, activityName, startTime, endTime } = req.body;
  if (!accessToken) {
    return res.status(401).json({ error: 'Token de acesso não fornecido para o Google Drive' });
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });
    const docs = google.docs({ version: 'v1', auth });

    // 1. Search for an existing document named "Feedback Agenda"
    const listRes = await drive.files.list({
      q: "name = 'Feedback Agenda' and mimeType = 'application/vnd.google-apps.document' and trashed = false",
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const files = listRes.data.files || [];
    let documentId: string;

    if (files.length > 0) {
      documentId = files[0].id!;
      console.log(`[Feedback] Documento existente encontrado: ${documentId}`);
    } else {
      // 2. Create a new document if it does not exist
      const createRes = await drive.files.create({
        requestBody: {
          name: 'Feedback Agenda',
          mimeType: 'application/vnd.google-apps.document',
        },
        fields: 'id',
      });
      documentId = createRes.data.id!;
      console.log(`[Feedback] Novo documento criado: ${documentId}`);
    }

    // 3. Format the new feedback entry
    const timestamp = new Date().toLocaleString('pt-BR');
    const textToInsert = `📅 ${timestamp}\nAtividade: ${activityName} (${startTime} - ${endTime})\nNota: ${rating}/10\nFeedback: ${feedbackText}\n--------------------------------------------------\n\n`;

    // 4. Prepend (insert at index 1)
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: textToInsert,
            },
          },
        ],
      },
    });

    res.json({ success: true, documentId, url: `https://docs.google.com/document/d/${documentId}/edit` });
  } catch (err: any) {
    console.error('Feedback API error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
