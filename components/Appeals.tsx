
import React, { useState, useEffect, useRef } from 'react';
import { Send, Copy, Check, FileText, Loader2, RefreshCw, Trash2, Save, Download, Lock, Unlock, Sparkles, ChevronDown, FileUp, AlertCircle, Pill, Activity, BookOpen, Quote, Image as ImageIcon, Briefcase, Plus } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateAppealLetter, parseDenialLetter, extractClinicalEvidenceForRebuttal, parseLetterhead } from '../services/geminiService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { saveCaseRecord } from '../services/historyService.ts';
import { AppealLetterRequest, AppealType } from '../types.ts';

const STORAGE_KEY = 'medauth_appeal_builder_v2';
const LETTER_STORAGE_KEY = 'medauth_appeal_letter_v2';
const LETTERHEAD_STORAGE_KEY = 'medauth_letterhead_img';

const Appeals: React.FC = () => {
  const [formData, setFormData] = useState<AppealLetterRequest>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      patientName: '',
      policyNumber: '',
      insuranceProvider: '',
      denialReason: '',
      clinicalEvidence: '',
      practiceGuidelines: '',
      positionStatements: '',
      letterheadInfo: '',
      cptCode: '',
      serviceName: '',
      templateType: 'Medical Necessity'
    };
  });

  const [loading, setLoading] = useState(false);
  const [parsingDoc, setParsingDoc] = useState<'denial' | 'clinical' | 'guideline' | 'statement' | 'letterhead' | null>(null);
  const [letter, setLetter] = useState(() => localStorage.getItem(LETTER_STORAGE_KEY) || '');
  const [letterheadImg, setLetterheadImg] = useState(() => localStorage.getItem(LETTERHEAD_STORAGE_KEY) || '');
  const [copied, setCopied] = useState(false);
  const [secureMode, setSecureMode] = useState(true);

  const fileInputs = {
    denial: useRef<HTMLInputElement>(null),
    clinical: useRef<HTMLInputElement>(null),
    guideline: useRef<HTMLInputElement>(null),
    statement: useRef<HTMLInputElement>(null),
    letterhead: useRef<HTMLInputElement>(null)
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    localStorage.setItem(LETTER_STORAGE_KEY, letter);
  }, [letter]);

  useEffect(() => {
    localStorage.setItem(LETTERHEAD_STORAGE_KEY, letterheadImg);
  }, [letterheadImg]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const handleDocUpload = async (type: 'denial' | 'clinical' | 'guideline' | 'statement' | 'letterhead', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingDoc(type);
    
    try {
      const base64 = await fileToBase64(file);
      const mime = file.type || 'application/pdf';

      if (type === 'denial') {
        const data = await parseDenialLetter(base64, mime);
        setFormData(p => ({ ...p, ...data }));
      } else if (type === 'letterhead') {
        const info = await parseLetterhead(base64, mime);
        setFormData(p => ({ ...p, letterheadInfo: info }));
        setLetterheadImg(`data:${mime};base64,${base64}`);
      } else {
        if (!formData.denialReason) {
          alert("Please provide a Denial Reason first so the AI knows what to focus on.");
          setParsingDoc(null);
          return;
        }
        const labelMap = { clinical: 'Clinical Record', guideline: 'Practice Guideline', statement: 'Position Statement' };
        const evidence = await extractClinicalEvidenceForRebuttal(base64, mime, formData.denialReason, labelMap[type as keyof typeof labelMap] as any);
        const fieldMap = { clinical: 'clinicalEvidence', guideline: 'practiceGuidelines', statement: 'positionStatements' };
        setFormData(p => ({ ...p, [fieldMap[type as keyof typeof fieldMap]]: evidence }));
      }
      logAction(getCurrentUser()!, `Uploaded ${type} context document`, 'APPEAL', `File: ${file.name}`);
    } catch (err) {
      alert("Processing failed. Please try a different document format.");
    } finally {
      setParsingDoc(null);
      if (fileInputs[type].current) fileInputs[type].current!.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!formData.denialReason) {
      alert("Denial reason is mandatory for rebuttal generation.");
      return;
    }
    setLoading(true);
    try {
      const result = await generateAppealLetter(formData, secureMode);
      setLetter(result);
      saveCaseRecord({ patientName: formData.patientName || 'Clinical Case', cptCode: formData.cptCode || 'N/A', type: 'Appeal', status: 'Draft Generated' });
    } catch (e) {
      alert("Generation failed.");
    } finally {
      setLoading(true);
      setTimeout(() => setLoading(false), 500);
    }
  };

  const downloadAsPDF = () => {
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // If we have a letterhead image, try to place it as a background/header
    if (letterheadImg) {
      try {
        // Simple header placement for letterhead
        doc.addImage(letterheadImg, 'PNG', 0, 0, pageWidth, 40); // Standard header area
      } catch (e) {
        console.warn("Letterhead overlay failed", e);
      }
    }

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    const textStart = letterheadImg ? 50 : 30;
    const splitText = doc.splitTextToSize(letter, pageWidth - margin * 2);
    doc.text(splitText, margin, textStart);
    
    doc.save(`Appeal_${formData.patientName || 'Case'}.pdf`);
  };

  const reset = () => {
    if (confirm("Reset builder?")) {
      setFormData({
        patientName: '',
        policyNumber: '',
        insuranceProvider: '',
        denialReason: '',
        clinicalEvidence: '',
        practiceGuidelines: '',
        positionStatements: '',
        letterheadInfo: formData.letterheadInfo, // Keep branding info
        cptCode: '',
        serviceName: '',
        templateType: 'Medical Necessity'
      });
      setLetter('');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Enterprise Appeal Suite</h2>
          <p className="text-slate-500">Construct high-authority rebuttals backed by clinical knowledge.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reset} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={18} /></button>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${secureMode ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
            <Lock size={12} /> Privacy: {secureMode ? 'Active' : 'Bypassed'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          {/* Practice Branding Card */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Briefcase size={14} /> Practice Letterhead
                </h4>
                <input type="file" ref={fileInputs.letterhead} onChange={(e) => handleDocUpload('letterhead', e)} className="hidden" accept=".pdf,.png,.jpg" />
                <button onClick={() => fileInputs.letterhead.current?.click()} className="text-[10px] font-black text-blue-600 hover:underline">
                  {parsingDoc === 'letterhead' ? 'Analysing...' : 'Upload Office Branding'}
                </button>
             </div>
             {letterheadImg ? (
               <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
                    <img src={letterheadImg} className="object-contain" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-900 uppercase tracking-tight">Template Loaded</p>
                    <p className="text-[9px] text-slate-500 truncate max-w-[150px]">{formData.letterheadInfo?.substring(0, 40)}...</p>
                  </div>
               </div>
             ) : (
               <div className="text-center py-4 border-2 border-dashed border-slate-100 rounded-2xl text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  No Letterhead Provided
               </div>
             )}
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Patient</label>
                <input type="text" value={formData.patientName} onChange={e => setFormData({...formData, patientName: e.target.value})} placeholder="Jane Doe" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Insurance</label>
                <input type="text" value={formData.insuranceProvider} onChange={e => setFormData({...formData, insuranceProvider: e.target.value})} placeholder="e.g. BCBS" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Case Type</label>
              <div className="relative">
                <select value={formData.templateType} onChange={e => setFormData({...formData, templateType: e.target.value as AppealType})} className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none appearance-none">
                  <option>Medical Necessity</option>
                  <option>Expedited/Urgent</option>
                  <option>Experimental/Investigational</option>
                  <option>Peer-to-Peer Request</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              </div>
            </div>

            <div className="space-y-1">
               <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Evidence Knowledge Base</label>
                <div className="flex gap-3">
                  <input type="file" ref={fileInputs.denial} onChange={(e) => handleDocUpload('denial', e)} className="hidden" />
                  <button onClick={() => fileInputs.denial.current?.click()} className="text-[9px] font-black text-blue-600 flex items-center gap-1">
                    <FileUp size={10} /> {parsingDoc === 'denial' ? 'Wait...' : 'Import Denial'}
                  </button>
                </div>
               </div>
               <textarea rows={2} value={formData.denialReason} onChange={e => setFormData({...formData, denialReason: e.target.value})} placeholder="Paste exact denial reason here..." className="w-full p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-medium text-rose-900 outline-none placeholder:text-rose-300" />
            </div>

            <div className="grid grid-cols-1 gap-3">
              {[
                { label: 'Patient Documentation', icon: Activity, type: 'clinical', color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Practice Guidelines', icon: BookOpen, type: 'guideline', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Position Statements', icon: Quote, type: 'statement', color: 'text-purple-600', bg: 'bg-purple-50' }
              ].map((item) => (
                <div key={item.type} className="group relative">
                  <input type="file" ref={fileInputs[item.type as keyof typeof fileInputs]} onChange={(e) => handleDocUpload(item.type as any, e)} className="hidden" />
                  <button 
                    onClick={() => fileInputs[item.type as keyof typeof fileInputs].current?.click()}
                    disabled={parsingDoc !== null}
                    className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                      (formData as any)[item.type === 'clinical' ? 'clinicalEvidence' : item.type === 'guideline' ? 'practiceGuidelines' : 'positionStatements'] 
                      ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 text-left">
                       <div className={`p-2 rounded-xl bg-white shadow-sm ${item.color}`}><item.icon size={16} /></div>
                       <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">{item.label}</p>
                         <p className="text-[9px] text-slate-400 font-bold">{ (formData as any)[item.type === 'clinical' ? 'clinicalEvidence' : item.type === 'guideline' ? 'practiceGuidelines' : 'positionStatements'] ? 'DOCUMENT LOADED' : 'NOT UPLOADED' }</p>
                       </div>
                    </div>
                    {parsingDoc === item.type ? <Loader2 size={16} className="animate-spin text-slate-300" /> : <Plus size={16} className="text-slate-300 group-hover:text-blue-500" />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleGenerate} disabled={loading} className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-xs rounded-3xl shadow-2xl hover:bg-blue-600 transition-all active:scale-[0.98] flex items-center justify-center gap-3">
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            Generate clinical rebuttal
          </button>
        </div>

        <div className="lg:col-span-7">
           {letter ? (
             <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col h-full min-h-[700px] overflow-hidden animate-in zoom-in-95 duration-500">
                <div className="px-8 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Office Rebuttal Draft</p>
                   <div className="flex gap-2">
                     <button onClick={downloadAsPDF} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"><Download size={18} /></button>
                     <button onClick={() => { navigator.clipboard.writeText(letter); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                       {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                     </button>
                   </div>
                </div>
                <div className="flex-1 p-12 overflow-y-auto font-serif text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                   {letter}
                </div>
             </div>
           ) : (
             <div className="h-full bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                <div className="w-24 h-24 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mb-6 opacity-40">
                  <FileText size={48} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Case Draft Empty</h3>
                <p className="text-sm mt-2 max-w-xs leading-relaxed">Import clinical evidence and position statements to generate a comprehensive medical appeal.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default Appeals;
