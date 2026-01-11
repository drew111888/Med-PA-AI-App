
import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Copy, Check, FileText, Loader2, Trash2, Download, 
  Lock, Sparkles, ChevronDown, BookMarked, Quote, FileUp, 
  X, AlertCircle, Search, ClipboardList 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateAppealLetter, parsePolicyDocument } from '../services/geminiService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { getBranding, getStatements } from '../services/assetService.ts';
import { getPolicies } from '../services/policyService.ts';
import { saveRecord } from '../services/historyService.ts';
import { AppealLetterRequest, AppealType, PositionStatement, MedicalPolicy, PracticeBranding } from '../types.ts';

const Appeals: React.FC = () => {
  const [formData, setFormData] = useState<AppealLetterRequest>({
    patientName: '',
    policyNumber: '',
    insuranceProvider: '',
    denialReason: '',
    clinicalEvidence: '',
    cptCode: '',
    templateType: 'Medical Necessity'
  });

  const [branding] = useState<PracticeBranding>(getBranding());
  const [statements] = useState<PositionStatement[]>(getStatements());
  const [policies] = useState<MedicalPolicy[]>(getPolicies());
  const [showAssetDrawer, setShowAssetDrawer] = useState<'STATEMENTS' | 'POLICIES' | null>(null);

  const [loading, setLoading] = useState(false);
  const [parsingDoc, setParsingDoc] = useState<'DENIAL' | 'CLINICAL' | null>(null);
  const [letter, setLetter] = useState('');
  const [copied, setCopied] = useState(false);
  const [secureMode, setSecureMode] = useState(true);

  const denialFileRef = useRef<HTMLInputElement>(null);
  const clinicalFileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'DENIAL' | 'CLINICAL') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingDoc(type);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await parsePolicyDocument(base64, file.type || 'application/pdf');
        
        if (type === 'DENIAL') {
          setFormData(prev => ({ 
            ...prev, 
            denialReason: result.content || '',
            insuranceProvider: result.carrier || prev.insuranceProvider 
          }));
        } else {
          setFormData(prev => ({ 
            ...prev, 
            clinicalEvidence: result.content || '',
            cptCode: result.cptCodes?.[0] || prev.cptCode 
          }));
        }
        setParsingDoc(null);
      };
    } catch (err) {
      alert("Failed to parse document.");
      setParsingDoc(null);
    }
  };

  const handleGenerate = async () => {
    if (!formData.patientName || !formData.denialReason) {
      alert("Please provide at least a Patient Name and Denial Reason.");
      return;
    }
    setLoading(true);

    const user = getCurrentUser();
    try {
      const generatedLetter = await generateAppealLetter({
        ...formData,
        clinicalEvidence: `[PRACTICE HEADER: ${branding.name}, NPI: ${branding.npi}]\n\n${formData.clinicalEvidence}`
      }, secureMode);
      
      setLetter(generatedLetter);
      
      if (user) {
        saveRecord({
          patient: formData.patientName,
          cpt: formData.cptCode,
          status: 'Generated',
          result: 'Appeal Created',
          type: 'Appeal'
        }, user);
        logAction(user, `Appeal generated for ${formData.patientName}`, 'APPEAL', `Type: ${formData.templateType}`);
      }
    } catch (error) {
      alert("Failed to generate appeal letter.");
    } finally {
      setLoading(true);
      setTimeout(() => setLoading(false), 500);
    }
  };

  const downloadAsPDF = () => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(letter, 170);
    doc.text(splitText, 20, 20);
    doc.save(`Appeal_${formData.patientName.replace(/\s+/g, '_')}.pdf`);
  };

  const injectAsset = (content: string) => {
    setFormData(prev => ({ ...prev, clinicalEvidence: `${prev.clinicalEvidence}\n\n${content}`.trim() }));
    setShowAssetDrawer(null);
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Appeal Builder</h2>
          <p className="text-slate-500">Draft rebuttals with denials, clinicals, and guidelines.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${
            secureMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <Lock size={12} /> {secureMode ? 'PHI Redaction Active' : 'Raw Output Mode'}
          </div>
          <button onClick={() => setFormData({ patientName: '', policyNumber: '', insuranceProvider: '', denialReason: '', clinicalEvidence: '', cptCode: '', templateType: 'Medical Necessity'})} className="p-2 text-slate-400 hover:text-rose-600 transition-colors">
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Appeal Template</label>
                <div className="relative">
                  <select 
                    value={formData.templateType}
                    onChange={e => setFormData({...formData, templateType: e.target.value as AppealType})}
                    className="w-full pl-5 pr-10 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
                  >
                    <option value="Medical Necessity">Medical Necessity</option>
                    <option value="Expedited/Urgent">Expedited/Urgent</option>
                    <option value="Experimental/Investigational">Experimental/Investigational</option>
                    <option value="Peer-to-Peer Request">Peer-to-Peer Request</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Patient Name</label>
                <input type="text" value={formData.patientName} onChange={e => setFormData({...formData, patientName: e.target.value})} placeholder="Full Legal Name" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Insurance / CPT</label>
                <div className="flex gap-2">
                  <input type="text" value={formData.insuranceProvider} onChange={e => setFormData({...formData, insuranceProvider: e.target.value})} placeholder="Carrier" className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" value={formData.cptCode} onChange={e => setFormData({...formData, cptCode: e.target.value})} placeholder="CPT" className="w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Denial Letter / Reason</label>
                <button onClick={() => denialFileRef.current?.click()} className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1 uppercase tracking-widest">
                  {parsingDoc === 'DENIAL' ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />}
                  Upload EOB/Denial
                </button>
                <input type="file" ref={denialFileRef} className="hidden" onChange={e => handleFileUpload(e, 'DENIAL')} accept=".pdf,.txt,.jpg,.png" />
              </div>
              <textarea rows={3} value={formData.denialReason} onChange={e => setFormData({...formData, denialReason: e.target.value})} placeholder="Paste exact denial text or upload a scan..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Clinical Supporting Evidence</label>
                <div className="flex gap-3">
                  <button onClick={() => setShowAssetDrawer('STATEMENTS')} className="text-[9px] font-black text-emerald-600 hover:underline flex items-center gap-1 uppercase tracking-widest">
                    <Quote size={10} /> Practice Assets
                  </button>
                  <button onClick={() => clinicalFileRef.current?.click()} className="text-[9px] font-black text-blue-600 hover:underline flex items-center gap-1 uppercase tracking-widest">
                    {parsingDoc === 'CLINICAL' ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />}
                    Upload Clinicals
                  </button>
                  <input type="file" ref={clinicalFileRef} className="hidden" onChange={e => handleFileUpload(e, 'CLINICAL')} accept=".pdf,.txt" />
                </div>
              </div>
              <textarea rows={6} value={formData.clinicalEvidence} onChange={e => setFormData({...formData, clinicalEvidence: e.target.value})} placeholder="Paste progress notes or upload records..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleGenerate} disabled={loading} className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              {loading ? 'Synthesizing Arguments...' : 'Generate Appeal Rebuttal'}
            </button>
          </div>
        </div>

        <div className="flex flex-col h-full relative">
          {showAssetDrawer && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right-10 duration-500">
               <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-widest flex items-center gap-2">
                    {showAssetDrawer === 'STATEMENTS' ? <Quote size={18} /> : <BookMarked size={18} />}
                    Select Evidence Asset
                  </h3>
                  <button onClick={() => setShowAssetDrawer(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
               </div>
               <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {showAssetDrawer === 'STATEMENTS' ? (
                    statements.length > 0 ? statements.map(s => (
                      <button key={s.id} onClick={() => injectAsset(s.content)} className="w-full text-left p-5 hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all group">
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 block">{s.category}</span>
                        <p className="font-bold text-slate-900 text-sm mb-1">{s.title}</p>
                        <p className="text-[10px] text-slate-400 line-clamp-2">{s.content}</p>
                      </button>
                    )) : (
                      <div className="p-10 text-center text-slate-400">
                        <Quote size={32} className="mx-auto mb-4 opacity-10" />
                        <p className="text-xs font-bold uppercase tracking-widest">No Statements Provisioned</p>
                      </div>
                    )
                  ) : (
                    policies.map(p => (
                      <button key={p.id} onClick={() => injectAsset(p.content)} className="w-full text-left p-5 hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all group">
                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1 block">{p.carrier}</span>
                        <p className="font-bold text-slate-900 text-sm">{p.title}</p>
                      </button>
                    ))
                  )}
               </div>
            </div>
          )}

          {letter ? (
            <div className="bg-white flex-1 rounded-[40px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clinical Draft Output</span>
                <div className="flex gap-2">
                  <button onClick={downloadAsPDF} className="p-2.5 hover:bg-slate-200 rounded-xl text-slate-600 transition-all"><Download size={18} /></button>
                  <button onClick={() => { navigator.clipboard.writeText(letter); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-2.5 hover:bg-slate-200 rounded-xl text-slate-600 transition-all">
                    {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex-1 p-10 overflow-y-auto font-serif text-slate-800 leading-relaxed whitespace-pre-wrap text-sm border-x border-slate-50 mx-4">
                {letter}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50/50 flex-1 rounded-[40px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center">
              <ClipboardList size={48} className="mb-4 text-slate-200" />
              <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Awaiting Build Inputs</p>
              <p className="text-[10px] text-slate-300 mt-2 max-w-[200px] font-bold uppercase tracking-tighter leading-tight">
                Upload denial and clinical records to synthesize a professional appeal draft.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Appeals;
