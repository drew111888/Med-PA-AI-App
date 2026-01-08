
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AppealLetterRequest, MedicalPolicy, RedactionMapping, PolicyDigest } from "../types.ts";
import { deIdentify, reIdentify } from "./complianceService.ts";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Analyzes clinical notes against medical necessity guidelines.
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
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      systemInstruction: "You are a senior medical necessity reviewer. Compare documentation against criteria. Return valid JSON.",
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
    result.missingRequirements = (result.missingRequirements || []).map(r => reIdentify(r, mapping));
    result.suggestedActionItems = (result.suggestedActionItems || []).map(a => reIdentify(a, mapping));
  }
  return result;
};

/**
 * Extracts office branding from a letterhead document.
 */
export const parseLetterhead = async (base64Data: string, mimeType: string): Promise<string> => {
  // Correctly structure contents with parts for multimodal input
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: "Extract the practice name, address, phone, and website from this letterhead. Format it as a professional header for a medical letter." }
      ]
    },
    config: {
      systemInstruction: "Extract ONLY the contact and branding text from the provided letterhead image or PDF. Do not include any greeting or signature."
    }
  });
  return response.text || "";
};

/**
 * Extracts key evidence for rebutting a specific denial.
 */
export const extractClinicalEvidenceForRebuttal = async (
  base64Data: string, 
  mimeType: string, 
  denialReason: string,
  contextType: 'Clinical Record' | 'Practice Guideline' | 'Position Statement' = 'Clinical Record'
): Promise<string> => {
  // Correctly structure contents with parts for multimodal input
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: `The insurance company denied coverage for: "${denialReason}". Scan this ${contextType} and extract ONLY the evidence that specifically refutes this denial. Summarize key points and cite page/section if available.` }
      ]
    },
    config: {
      systemInstruction: "You are a physician advisor extracting evidence to overturn insurance denials. Be precise and evidence-based."
    }
  });
  return response.text || "";
};

/**
 * Generates a formal medical appeal letter.
 */
export const generateAppealLetter = async (request: AppealLetterRequest, useSecureMode: boolean = false): Promise<string> => {
  let mapping: RedactionMapping = {};
  let req = { ...request };

  if (useSecureMode) {
    const nameRed = deIdentify(request.patientName, { name: request.patientName });
    req.patientName = "[PATIENT_NAME]";
    const polRed = deIdentify(request.policyNumber, { policy: request.policyNumber });
    req.policyNumber = "[POLICY_ID]";
    const clinicalRed = deIdentify(request.clinicalEvidence, { name: request.patientName, policy: request.policyNumber });
    req.clinicalEvidence = clinicalRed.redactedText;
    mapping = { ...nameRed.mapping, ...polRed.mapping, ...clinicalRed.mapping };
  }

  const prompt = `
    Draft a formal ${req.templateType} medical appeal letter.
    
    Practice Branding Header: ${req.letterheadInfo || 'None provided (Use standard professional header)'}
    Patient: ${req.patientName}
    Policy: ${req.policyNumber}
    Insurance: ${req.insuranceProvider}
    Denied Service/Med: ${req.serviceName || 'N/A'}
    CPT: ${req.cptCode || 'Not provided'}
    Reason for Denial: ${req.denialReason}
    
    CORE CLINICAL EVIDENCE: 
    ${req.clinicalEvidence}
    
    SUPPORTING CLINICAL GUIDELINES (Use to cite standards of care):
    ${req.practiceGuidelines || 'None provided'}
    
    MEDICAL POSITION STATEMENTS (Use to cite specialty consensus):
    ${req.positionStatements || 'None provided'}
    
    Instructions:
    - If a Practice Branding Header is provided, START the letter with it.
    - Cite the Supporting Clinical Guidelines and Position Statements directly in the rebuttal.
    - Ensure a formal physician tone.
    - Close with a signature line for the treating physician.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: "You are a senior physician advisor. Your letters are highly evidence-based and professionally formatted on practice letterhead. Use specific citations from provided guidelines."
    }
  });

  const letter = response.text || "Failed to generate.";
  return useSecureMode ? reIdentify(letter, mapping) : letter;
};

/**
 * Generates a structured digest from a medical policy text.
 */
export const generatePolicyDigest = async (policyContent: string): Promise<PolicyDigest> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Summarize this medical policy: \n\n${policyContent}`,
    config: {
      systemInstruction: "Extract requirements, exclusions, and documentation checklists. Return JSON.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          keyCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
          exclusionCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
          documentationChecklist: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["summary", "keyCriteria", "documentationChecklist"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

/**
 * Extracts case details from a denial letter image or PDF.
 */
export const parseDenialLetter = async (base64Data: string, mimeType: string): Promise<Partial<AppealLetterRequest>> => {
  // Correctly structure contents with parts for multimodal input
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: "Extract case details." }
      ]
    },
    config: {
      systemInstruction: "Extract Patient, Carrier, Policy, CPT, Service, Denial Reason. Return JSON.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          patientName: { type: Type.STRING },
          insuranceProvider: { type: Type.STRING },
          policyNumber: { type: Type.STRING },
          cptCode: { type: Type.STRING },
          serviceName: { type: Type.STRING },
          denialReason: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

/**
 * Extracts policy details from a medical policy document.
 */
export const parsePolicyDocument = async (base64Data: string, mimeType: string): Promise<Partial<MedicalPolicy>> => {
  // Correctly structure contents with parts for multimodal input
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: "Extract policy details." }
      ]
    },
    config: {
      systemInstruction: "Extract carrier, title, codes, meds, summary. Return JSON.",
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
