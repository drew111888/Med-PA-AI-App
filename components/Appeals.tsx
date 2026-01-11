
import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Copy, Check, FileText, Loader2, Trash2, Download, 
  Lock, Sparkles, ChevronDown, BookMarked, Quote, FileUp, 
  X, AlertCircle, Search, ClipboardList, Mail, Plus
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateAppealLetter, parsePolicyDocument } from '../services/geminiService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { getBranding, getStatements } from '../services/assetService.ts';
import { getPolicies } from '../services/policyService.ts';
import { saveRecord } from '../services/historyService.ts';
import { AppealLetterRequest, AppealType, PositionStatement, MedicalPolicy, PracticeBranding } from '../types.ts';

/**
 * Appeals component for building evidence-based medical appeal letters.
 * Fixed to include full UI logic and default export.
 */
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
  const [parsingDoc, setParsingDoc] = useState<'DENIAL' | 'CLINICAL' | 'POLICY' | null>(null);
  const [letter, setLetter] = useState('');
  const [copied, setCopied] = useState(false);
  const [secureMode, setSecureMode] = useState(true);

  const denialFileRef = useRef<HTMLInputElement>(null);
  const clinicalFileRef = useRef<HTMLInputElement>(null);
  const policyFileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'DENIAL' | 'CLINICAL' | 'POLICY') => {
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
        } else if (type === 'CLINICAL') {
          setFormData(prev => ({ 
            ...prev, 
            clinicalEvidence: result.content || '',
            cptCode: result.cptCodes?.[0] || prev.cptCode 
          }));
        } else if (type === 'POLICY') {
          setFormData(prev => ({
             ...prev,
             clinicalEvidence: `[GUIDELINE REFERENCE: ${result.title} (${result.carrier})]\n${result.content}\n\n${prev.clinicalEvidence}`.trim()
          }));
        }
        setParsingDoc(null);
      };
    } catch (err) {
      alert("Failed to parse document. Please ensure it is a valid PDF or text file.");
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
        clinicalEvidence: `[PRACTICE HEADER: ${branding.name || 'Practice'}, NPI: ${branding.npi || 'N/A'}]\n\n${formData.clinicalEvidence}`
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
        logAction(user, `Appeal generated for ${formData.patientName}`, 'APPEAL', `Type: ${formData.templateType}`).catch(console.error);
      }
    } catch (error) {
      alert("Failed to generate appeal letter. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = () => {
    if (!letter) return;
    const subject = encodeURIComponent(`Appeal Draft: ${formData.patientName} (CPT: ${formData.cptCode})`);
    const body = encodeURIComponent(letter);
    window.location.href = `mailto:${branding.contactEmail || ''}?subject=${subject}&body=${body}`;
  };

  const downloadAsPDF = () => {
    if (!letter) return;
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(letter, 170);
    doc.text(splitText, 20, 20);
    doc.save(`Appeal_${(formData.patientName || 'Record').replace(/\s+/g, '_')}.pdf`);
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
                  <input type="text" value={formData.insuranceProvider} onChange={e => setFormData({...formData, insuranceProvider: e.target.value})} placeholder="Carrier" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" value={formData.cptCode} onChange={e => setFormData({...formData, cptCode: e.target.value})} placeholder="CPT" className="w-24 px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Denial Reason / Letter</label>
                <button onClick={() => denialFileRef.current?.click()} className="text-[10px] font-black text-blue-600 hover:underline uppercase tracking-widest flex items-center gap-1">
                   {parsingDoc === 'DENIAL' ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />} Upload Denial
                </button>
                <input type="file" ref={denialFileRef} className="hidden" onChange={e => handleFileUpload(e, 'DENIAL')} accept=".pdf,.txt" />
              </div>
              <textarea rows={4} value={formData.denialReason} onChange={e => setFormData({...formData, denialReason: e.target.value})} placeholder="Paste carrier denial text or upload document..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Clinical Evidence / Assets</label>
                <div className="flex gap-4">
                  <button onClick={() => setShowAssetDrawer('STATEMENTS')} className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest flex items-center gap-1">
                    <BookMarked size={10} /> Library
                  </button>
                   <button onClick={() => clinicalFileRef.current?.click()} className="text-[10px] font-black text-blue-600 hover:underline uppercase tracking-widest flex items-center gap-1">
                    {parsingDoc === 'CLINICAL' ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />} Records
                  </button>
                  <input type="file" ref={clinicalFileRef} className="hidden" onChange={e => handleFileUpload(e, 'CLINICAL')} accept=".pdf,.txt" />
                </div>
              </div>
              <textarea rows={6} value={formData.clinicalEvidence} onChange={e => setFormData({...formData, clinicalEvidence: e.target.value})} placeholder="Paste supporting clinical findings or inject from library..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleGenerate} disabled={loading} className="w-full py-5 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-3 transition-all">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              {loading ? 'Drafting Evidence-Based Appeal...' : 'Generate Clinical Appeal'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {!letter && !loading ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[40px]">
              <FileText className="text-slate-200 mb-4" size={64} />
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Appeal Draft Output</h3>
              <p className="text-slate-400 text-xs max-w-[200px] font-bold uppercase tracking-tighter mt-2">Generate a letter to see the evidence-based rebuttal here.</p>
            </div>
          ) : loading ? (
            <div className="bg-white p-16 rounded-[40px] border border-slate-100 shadow-2xl flex flex-col items-center justify-center text-center animate-pulse">
              <Loader2 className="text-blue-500 animate-spin mb-6" size={48} />
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest">AI Drafting in Progress</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Synthesizing clinical evidence against carrier policy...</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
               <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl relative">
                  <div className="absolute top-8 right-8 flex gap-2">
                    <button 
                      onClick={() => { navigator.clipboard.writeText(letter); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl border border-slate-100 transition-all"
                    >
                      {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    </button>
                  </div>
                  <div className="prose prose-slate max-w-none">
                    <div className="flex items-center gap-3 mb-8 pb-8 border-b border-slate-50">
                      <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                        <Quote size={24} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Medical Appeal Draft</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Generated via clinical reasoning engine</p>
                      </div>
                    </div>
                    <textarea 
                      readOnly
                      value={letter}
                      className="w-full h-[500px] bg-transparent border-none focus:ring-0 text-sm font-medium leading-relaxed text-slate-700 resize-none outline-none"
                    />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <button onClick={downloadAsPDF} className="flex items-center justify-center gap-3 py-4 bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
                    <Download size={16} /> Export as PDF
                  </button>
                  <button onClick={handleEmail} className="flex items-center justify-center gap-3 py-4 bg-white text-slate-900 border border-slate-200 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
                    <Mail size={16} /> Email to Provider
                  </button>
               </div>
            </div>
          )}
        </div>
      </div>

      {showAssetDrawer === 'STATEMENTS' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
            <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">Clinical Position Library</h3>
                <p className="text-indigo-100 text-xs">Inject pre-approved clinical stances into your appeal.</p>
              </div>
              <button onClick={() => setShowAssetDrawer(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 gap-4">
                {statements.length > 0 ? statements.map(s => (
                  <button key={s.id} onClick={() => injectAsset(s.content)} className="w-full text-left p-6 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-3xl transition-all group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 bg-white text-indigo-600 text-[9px] font-black uppercase rounded border border-indigo-100">{s.category}</span>
                      <Plus size={14} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1">{s.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{s.content}</p>
                  </button>
                )) : (
                  <div className="py-20 text-center">
                    <BookMarked size={40} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Library Empty</p>
                    <p className="text-xs text-slate-300 mt-1">Add position statements in Practice Settings.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Appeals;
