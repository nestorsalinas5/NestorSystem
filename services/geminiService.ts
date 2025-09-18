


import { GoogleGenAI, Type } from "@google/genai";

const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  console.warn("VITE_API_KEY environment variable not set. Gemini features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: apiKey! });

export const getDashboardInsights = async (
  totalIncome: number,
  totalExpenses: number,
  netProfit: number,
  eventCount: number
): Promise<string> => {
  if (!apiKey) {
    return "API Key no configurada. Las percepciones de IA están deshabilitadas.";
  }
  
  const prompt = `
    Eres un asesor de negocios para un DJ o organizador de eventos.
    Basado en las siguientes métricas del mes, proporciona un breve resumen (2-3 frases) con percepciones y una recomendación clave.
    Sé conciso y directo.
    - Ingresos Totales: ${totalIncome}
    - Gastos Totales: ${totalExpenses}
    - Ganancia Neta: ${netProfit}
    - Número de Eventos: ${eventCount}
    
    Ejemplo de respuesta: "Este mes muestra una ganancia saludable. Con ${eventCount} eventos, tu rentabilidad es sólida. Considera enfocarte en eventos de mayor valor para maximizar ingresos."
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.5,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error fetching insights from Gemini:", error);
    return "No se pudieron generar las percepciones de IA en este momento.";
  }
};

// FIX: Implemented missing function to get AI-powered inquiry reply suggestions.
export const getInquiryReplySuggestion = async (inquiryMessage: string): Promise<string> => {
  if (!apiKey) {
    return "API Key no configurada.";
  }
  const prompt = `
    Eres un asistente para un DJ/organizador de eventos. Has recibido la siguiente consulta de un cliente potencial:
    ---
    ${inquiryMessage}
    ---
    Genera una respuesta profesional y amigable. Agradece el interés, confirma la recepción del mensaje y menciona que revisarás los detalles y te pondrás en contacto pronto para proporcionar una cotización o más información.
    Mantén un tono positivo y servicial.
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.6 }
    });
    return response.text;
  } catch (error) {
    console.error("Error fetching inquiry suggestion from Gemini:", error);
    return "No se pudo generar una sugerencia en este momento.";
  }
};

// FIX: Implemented missing function to get AI-powered follow-up email suggestions.
export const getFollowUpEmailSuggestion = async (clientName: string, budgetTitle: string): Promise<string> => {
  if (!apiKey) {
    return "API Key no configurada.";
  }
  const prompt = `
    Eres un asistente para un DJ/organizador de eventos. Necesitas escribir un correo de seguimiento para un cliente sobre un presupuesto que ya enviaste.
    - Nombre del Cliente: ${clientName}
    - Título del Presupuesto: "${budgetTitle}"

    Escribe un correo breve y amigable para preguntar si tuvo la oportunidad de revisar el presupuesto. Pregunta si tiene alguna duda o si hay algo que se pueda ajustar.
    Termina con una nota positiva, mostrando entusiasmo por la posibilidad de trabajar juntos.
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text;
  } catch (error) {
    console.error("Error fetching follow-up suggestion from Gemini:", error);
    return "No se pudo generar una sugerencia en este momento.";
  }
};

// FIX: Implemented missing function to get AI-powered budget item suggestions.
export const getBudgetItemsSuggestion = async (eventDescription: string): Promise<string> => {
    if (!apiKey) {
        return "";
    }
    const prompt = `
      Basado en la siguiente descripción de un evento, sugiere una lista de 5 a 7 items o servicios clave que un DJ u organizador de eventos debería incluir en un presupuesto.
      Descripción: "${eventDescription}"
      
      Responde únicamente con una lista de los items separados por comas. No incluyas números, viñetas ni explicaciones adicionales.
      Ejemplo de respuesta: Sonido profesional, Iluminación de pista, Máquina de humo, DJ por 5 horas, Proyector y pantalla, Cabina de DJ, Micrófono inalámbrico
    `;
    try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { temperature: 0.3 }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error fetching budget items suggestion from Gemini:", error);
        return "Error al generar sugerencias";
    }
};

// FIX: Added function to generate a detailed event schedule using AI.
export const generateEventSchedule = async (
  eventType: string,
  startTime: string,
  endTime: string,
  keyMoments: string
): Promise<string> => {
  if (!apiKey) {
    return "[]";
  }

  const prompt = `
    Actúa como un organizador de eventos de clase mundial para un DJ. Tu tarea es crear un cronograma detallado y profesional para un evento.
    
    Aquí están los detalles:
    - Tipo de Evento: ${eventType}
    - Hora de Inicio: ${startTime}
    - Hora de Finalización: ${endTime}
    - Momentos Clave solicitados por el cliente: ${keyMoments}

    Instrucciones:
    1.  Crea una secuencia lógica de eventos desde el inicio hasta el fin.
    2.  Incorpora todos los "Momentos Clave" en el cronograma en momentos apropiados.
    3.  Rellena los espacios con actividades típicas para este tipo de evento (ej: recepción, música de fondo, baile, etc.).
    4.  Para cada bloque de tiempo, proporciona un título de "actividad" claro y "detalles" específicos.
    5.  En los "detalles", incluye sugerencias para el DJ sobre el estilo de música, el volumen, y cualquier acción necesaria como anuncios por micrófono.
    6.  El resultado debe ser un JSON array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.5,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: {
                type: Type.STRING,
                description: 'Rango horario del bloque. Ej: "20:00 - 21:00"'
              },
              activity: {
                type: Type.STRING,
                description: 'Título principal de la actividad. Ej: "Recepción de Invitados"'
              },
              details: {
                type: Type.STRING,
                description: 'Instrucciones detalladas para el DJ. Ej: "Música: Chill out, instrumental. Volumen: 30%. Coordinar con el fotógrafo para la entrada."'
              }
            },
            required: ["time", "activity", "details"]
          }
        }
      }
    });

    return response.text.trim();
  } catch (error) {
    console.error("Error generating event schedule from Gemini:", error);
    throw new Error("No se pudo generar el cronograma. Intenta de nuevo.");
  }
};
