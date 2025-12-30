import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AppealLetterRequest, MedicalPolicy, RedactionMapping } from "../types.ts";
import { deIdentify, reIdentify } from "./complianceService.ts";

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Analyzes clinical notes against medical necessity guidelines using Gemini 3 Pro.
 */
export const analyzeGuidelines = async (
  guidelineText: string,
  clinicalNotes: string,
  cptCode: string,
  useSecureMode: boolean = false
): Promise<AnalysisResult> => {
  let processedNotes = clinicalNotes;
  let mapping: RedactionMapping = {};

  if (useSecureMode) {
    const redaction = deIdentify(clinicalNotes, {});
    processedNotes = redaction.redactedText;
    mapping = redaction.mapping;
  }

  const prompt = `
    Analyze the following patient clinical notes against the provided medical necessity guidelines for CPT code: ${cptCode}.
    
    GUIDELINES:
    ${guidelineText}
    
    PATIENT CLINICAL NOTES:
    ${processedNotes}
    
    Evaluate if the criteria are met. Provide a confidence score and clear reasoning.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      systemInstruction: "You are a senior medical necessity reviewer. Your task is to compare clinical documentation against insurance policy criteria. Be objective, precise, and identify specific missing documentation elements required for authorization approval.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, enum: ['Likely Approved', 'Likely Denied', 'Insufficient Data'] },
          confidenceScore: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          missingRequirements: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedActionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
          referenceQuotes: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["status", "confidenceScore", "reasoning"]
      }
    }
  });

  const result: AnalysisResult = JSON.parse(response.text || "{}");
  
  if (useSecureMode) {
    result.reasoning = reIdentify(result.reasoning, mapping);
    result.missingRequirements = result.missingRequirements.map(r => reIdentify(r, mapping));
    result.suggestedActionItems = result.suggestedActionItems.map(a => reIdentify(a, mapping));
  }

  return result;
};

/**
 * Generates a formal medical appeal letter using Gemini 3 Flash.
 */
export const generateAppealLetter = async (request: AppealLetterRequest, useSecureMode: boolean = false): Promise<string> => {
  let mapping: RedactionMapping = {};
  let req = { ...request };

  if (useSecureMode) {
    const nameRedaction = deIdentify(request.patientName, { name: request.patientName });
    req.patientName = "[PATIENT_NAME]";
    
    const policyRedaction = deIdentify(request.policyNumber, { policy: request.policyNumber });
    req.policyNumber = "[POLICY_ID]";
    
    const evidenceRedaction = deIdentify(request.clinicalEvidence, { name: request.patientName, policy: request.policyNumber });
    req.clinicalEvidence = evidenceRedaction.redactedText;

    mapping = { 
      ...nameRedaction.mapping, 
      ...policyRedaction.mapping, 
      ...evidenceRedaction.mapping 
    };
  }

  const prompt = `
    Draft a professional medical appeal letter for the following case:
    Patient: ${req.patientName}
    Policy: ${req.policyNumber}
    Insurance: ${req.insuranceProvider}
    CPT: ${req.cptCode}
    Reason for Denial: ${req.denialReason}
    Supporting Evidence: ${req.clinicalEvidence}
    
    The letter should be formal, persuasive, and use standard clinical terminology.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: "You are a medical billing advocate and clinical specialist. Write persuasive, evidence-based appeal letters that cite specific clinical necessity and challenge insurance denials based on the provided documentation."
    }
  });

  const letter = response.text || "Failed to generate letter.";
  return useSecureMode ? reIdentify(letter, mapping) : letter;
};

/**
 * Parses medical policy documents (PDF/Text) into structured data.
 */
export const parsePolicyDocument = async (base64Data: string, mimeType: string): Promise<Partial<MedicalPolicy>> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      },
      {
        text: "Extract the following details from this medical policy document: Carrier name, Policy Title, CPT Codes mentioned, any Medications mentioned, and a summary of the Clinical Necessity Guidelines."
      }
    ],
    config: {
      systemInstruction: "You are a medical data extraction expert. Extract structural information from insurance carrier policy documents and return it in a structured format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          carrier: { type: Type.STRING },
          title: { type: Type.STRING },
          cptCodes: { type: Type.ARRAY, items: { type: Type.STRING } },
          medications: { type: Type.ARRAY, items: { type: Type.STRING } },
          content: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
};