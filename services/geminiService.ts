
import { GoogleGenAI } from "@google/genai";

if (!process.env.API_KEY) {
  console.warn("API_KEY environment variable not set. Gemini features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const generateContentWithGuard = async (prompt: string): Promise<string> => {
    if (!process.env.API_KEY) {
        return "API Key no configurada. Las funciones de IA están deshabilitadas.";
    }
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { temperature: 0.6 }
        });
        return response.text;
    } catch (error) {
        console.error("Error fetching from Gemini:", error);
        return "No se pudo conectar con el asistente de IA en este momento.";
    }
};

export const getDashboardInsights = (
  totalIncome: number,
  totalExpenses: number,
  netProfit: number,
  eventCount: number
): Promise<string> => {
  const prompt = `
    Eres un asesor de negocios para un DJ profesional. Analiza las siguientes métricas del mes actual:
    - Ingresos Totales: ${totalIncome} Gs.
    - Gastos Totales: ${totalExpenses} Gs.
    - Ganancia Neta: ${netProfit} Gs.
    - Número de Eventos: ${eventCount}
    Basado en estos datos, proporciona un resumen conciso (2-3 frases) con una percepción clave y una recomendación de negocio accionable. Sé directo y profesional.
    Ejemplo: "Este mes muestra una excelente rentabilidad. Con ${eventCount} eventos, tu margen por evento es muy alto. Recomendación: Considera invertir en marketing para atraer más clientes de este calibre."
  `;
  return generateContentWithGuard(prompt);
};

export const getInquiryReplySuggestion = (clientMessage: string): Promise<string> => {
    const prompt = `
    Eres un asistente virtual para un DJ profesional. Un cliente potencial ha enviado el siguiente mensaje a través de un formulario de consulta:
    "${clientMessage}"
    Genera una respuesta de email profesional, amigable y corta. Agradece su interés, demuestra que leíste su mensaje y haz 1 o 2 preguntas clave para poder enviarle un presupuesto preciso (ej: número de invitados, lugar, horas de servicio).
    No incluyas un saludo final como "Saludos".
    `;
    return generateContentWithGuard(prompt);
};

export const getFollowUpEmailSuggestion = (clientName: string, budgetTitle: string): Promise<string> => {
    const prompt = `
    Eres un asistente virtual para un DJ profesional. Necesitas escribir un email de seguimiento para un presupuesto que ya fue enviado.
    - Nombre del Cliente: ${clientName}
    - Título del Presupuesto: ${budgetTitle}
    Genera 2 opciones de emails de seguimiento. Deben ser cortos, amigables y no muy insistentes. El objetivo es reabrir la conversación.
    Formato de respuesta:
    Opción 1:
    [Texto de la opción 1]
    ---
    Opción 2:
    [Texto de la opción 2]
    `;
    return generateContentWithGuard(prompt);
};

export const getBudgetItemsSuggestion = (eventDescription: string): Promise<string> => {
    const prompt = `
    Eres un productor de eventos experimentado. Un DJ necesita ayuda para armar un presupuesto.
    Descripción del evento: "${eventDescription}"
    Basado en la descripción, genera una lista de 5 a 7 items (servicios o equipos) que deberían incluirse en el presupuesto.
    Devuelve la lista como items separados por comas, sin numeración ni guiones.
    Ejemplo de respuesta: "Servicio de DJ (5 horas), Sonido para 150 personas, Iluminación de pista de baile, Micrófono inalámbrico para discursos, Máquina de humo, Cabina de DJ iluminada"
    `;
    return generateContentWithGuard(prompt);
};
