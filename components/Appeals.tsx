
import React, { useState, useEffect, useRef } from 'react';
import { Send, Copy, Check, FileText, Loader2, RefreshCw, Trash2, Save, Download, Lock, Unlock, Sparkles, ChevronDown, FileUp, AlertCircle, Pill, Activity } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateAppealLetter, parseDenialLetter, extractClinicalEvidenceForRebuttal } from '../services/geminiService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { saveCaseRecord } from '../services/historyService.ts';
import { AppealLetterRequest, AppealType } from '../types.ts';

const STORAGE_KEY = 'medauth_appeal_draft';
const LETTER_STORAGE_KEY = 'medauth_appeal_letter_result';

const Appeals: React.FC = () => {
  const [formData, setFormData] = useState<AppealLetterRequest>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      patientName: '',
      policyNumber: '',
      insuranceProvider: '',
      denialReason: '',
      clinicalEvidence: '',
      cptCode: '',
      serviceName: '',
      templateType: 'Medical Necessity'
    };
  });

  const [loading, setLoading] = useState(false);
  const [parsingDenial, setParsingDenial] = useState(false);
  const [parsingClinical, setParsingClinical] = useState(false);
  const [letter, setLetter] = useState(() => localStorage.getItem(LETTER_STORAGE_KEY) || '');
  const [copied, setCopied] = useState(false);
  const [secureMode, setSecureMode] = useState(true);

  const denialInputRef = useRef<HTMLInputElement>(null);
  const clinicalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    localStorage.setItem(LETTER_STORAGE_KEY, letter);
  }, [letter]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const handleDenialUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParsingDenial(true);
    try {
      const base64 = await fileToBase64(file);
      const data = await parseDenialLetter(base64, file.type || 'application/pdf');
      
      setFormData(prev => ({
        ...prev,
        patientName: data.patientName || prev.patientName,
        insuranceProvider: data.insuranceProvider || prev.insuranceProvider,
        policyNumber: data.policyNumber || prev.policyNumber,
        cptCode: data.cptCode || prev.cptCode,
        serviceName: data.serviceName || prev.serviceName,
        denialReason: data.denialReason || prev.denialReason,
      }));

      const user = getCurrentUser();
      if (user) logAction(user, `Denial PDF parsed: ${file.name}`, 'APPEAL', 'Case details auto-populated from PDF');
    } catch (error) {
      console.error(error);
      alert("Failed to parse denial letter. Please ensure it is a clear document.");
    } finally {
      setParsingDenial(false);
      if (denialInputRef.current) denialInputRef.current.value = '';
    }
  };

  const handleClinicalUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!formData.denialReason) {
      alert("Please enter or import the denial reason first so the AI knows what to look for in the clinical records.");
      return;
    }

    setParsingClinical(true);
    try {
      const base64 = await fileToBase64(file);
      const evidence = await extractClinicalEvidenceForRebuttal(base64, file.type || 'application/pdf', formData.denialReason);
      
      setFormData(prev => ({
        ...prev,
        clinicalEvidence: evidence || prev.clinicalEvidence
      }));

      const user = getCurrentUser();
      if (user) logAction(user, `Clinical records parsed for rebuttal: ${file.name}`, 'APPEAL', 'Clinical evidence extracted from medical records');
    } catch (error) {
      console.error(error);
      alert("Failed to extract evidence from clinical records.");
    } finally {
      setParsingClinical(false);
      if (clinicalInputRef.current) clinicalInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!formData.patientName || !formData.denialReason) {
      alert("Please provide at least a Patient Name and Denial Reason.");
      return;
    }
    setLoading(true);

    const user = getCurrentUser();
    if (user) {
      logAction(user, `Appeal generated (${formData.templateType}) for ${formData.patientName}`, 'APPEAL', `Secure Mode: ${secureMode}`);
    }

    try {
      const generatedLetter = await generateAppealLetter(formData, secureMode);
      setLetter(generatedLetter);

      // Save to case history
      saveCaseRecord({
        patientName: formData.patientName,
        cptCode: formData.cptCode || 'N/A',
        type: 'Appeal',
        status: 'Generated'
      });

    } catch (error) {
      console.error(error);
      alert("Failed to generate appeal letter.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAsPDF = () => {
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const splitText = doc.splitTextToSize(letter, pageWidth - margin * 2);
    
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.text("MEDICAL APPEAL LETTER", margin, 20);
    
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text(splitText, margin, 35);
    
    const fileName = `Appeal_${formData.patientName.replace(/\s+/g, '_') || 'Letter'}.pdf`;
    doc.save(fileName);

    const user = getCurrentUser();
    if (user) logAction(user, `PDF Downloaded for ${formData.patientName}`, 'POLICY_EXPORT', 'Appeal letter generated and saved');
  };

  const resetDraft = () => {
    if (window.confirm("Clear appeal draft?")) {
      setFormData({
        patientName: '',
        policyNumber: '',
        insuranceProvider: '',
        denialReason: '',
        clinicalEvidence: '',
        cptCode: '',
        serviceName: '',
        templateType: 'Medical Necessity'
      });
      setLetter('');
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LETTER_STORAGE_KEY);
    }
  };

  const appealTypes: AppealType[] = ['Medical Necessity', 'Expedited/Urgent', 'Experimental/Investigational', 'Peer-to-Peer Request'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Appeal Builder</h2>
          <p className="text-slate-500">Draft professional rebuttals with clinical evidence.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
            secureMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <Lock size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">Privacy Mode: {secureMode ? 'ON' : 'OFF'}</span>
          </div>
          <button onClick={resetDraft} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
          <div className="space-y-4">
             <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Appeal Type / Template</label>
              <div className="flex gap-2">
                <input type="file" ref={denialInputRef} onChange={handleDenialUpload} className="hidden" accept=".pdf,.png,.jpg,.jpeg" />
                <button 
                  onClick={() => denialInputRef.current?.click()}
                  disabled={parsingDenial}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-2 py-1 rounded-md flex items-center gap-1.5 transition-all"
                >
                  {parsingDenial ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />}
                  IMPORT DENIAL PDF
                </button>
              </div>
             </div>

            <div className="relative">
              <select 
                value={formData.templateType}
                onChange={e => setFormData({...formData, templateType: e.target.value as AppealType})}
                className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700"
              >
                {appealTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Patient Name</label>
                <input type="text" value={formData.patientName} onChange={e => setFormData({...formData, patientName: e.target.value})} placeholder="Jane Doe" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Carrier Name</label>
                <input type="text" value={formData.insuranceProvider} onChange={e => setFormData({...formData, insuranceProvider: e.target.value})} placeholder="e.g. Aetna" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Policy / Member ID</label>
                <input type="text" value={formData.policyNumber} onChange={e => setFormData({...formData, policyNumber: e.target.value})} placeholder="ID-12345" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">CPT Code (Optional)</label>
                <input type="text" value={formData.cptCode} onChange={e => setFormData({...formData, cptCode: e.target.value})} placeholder="e.g. 72148" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                 Service / Medication / Test Name
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.serviceName} 
                  onChange={e => setFormData({...formData, serviceName: e.target.value})} 
                  placeholder="e.g. Ocrevus, Lumbar MRI, Wegovy" 
                  className="w-full pl-10 pr-4 py-2 bg-blue-50/50 border border-blue-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-blue-900" 
                />
                <Activity size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Specific Denial Reason</label>
              <textarea rows={2} value={formData.denialReason} onChange={e => setFormData({...formData, denialReason: e.target.value})} placeholder="Paste exact wording from the EOB or denial letter..." className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Clinical Evidence</label>
                <div className="flex gap-2">
                  <input type="file" ref={clinicalInputRef} onChange={handleClinicalUpload} className="hidden" accept=".pdf,.png,.jpg,.jpeg" />
                  <button 
                    onClick={() => clinicalInputRef.current?.click()}
                    disabled={parsingClinical}
                    className="text-[10px] text-indigo-600 font-black flex items-center gap-1.5 hover:underline"
                  >
                    {parsingClinical ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                    IMPORT RECORDS FOR REBUTTAL
                  </button>
                </div>
              </div>
              <textarea rows={5} value={formData.clinicalEvidence} onChange={e => setFormData({...formData, clinicalEvidence: e.target.value})} placeholder="Clinical rationale to refute the denial..." className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <button onClick={handleGenerate} disabled={loading} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
            {loading ? 'AI Draft in Progress...' : 'Generate Rebuttal Letter'}
          </button>
        </div>

        <div className="flex flex-col h-full min-h-[500px]">
          {letter ? (
            <div className="bg-white flex-1 rounded-3xl shadow-xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Clinical Draft</span>
                <div className="flex gap-2">
                  <button onClick={downloadAsPDF} className="p-2 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors" title="Export PDF"><Download size={18} /></button>
                  <button onClick={copyToClipboard} className="p-2 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors" title="Copy Text">{copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}</button>
                </div>
              </div>
              <div className="flex-1 p-10 overflow-y-auto font-serif text-slate-800 leading-relaxed whitespace-pre-wrap text-[15px]">
                {letter}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 flex-1 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <Send size={48} className="mb-4 opacity-10" />
              <p className="font-medium">Populate the case details to build a draft.</p>
              <p className="text-xs mt-2 opacity-60 max-w-xs">Our AI will cite medical standards and refute denial reasons based on your input.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Appeals;
