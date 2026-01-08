
import React, { useState, useEffect } from 'react';
import { Send, Copy, Check, FileText, Loader2, RefreshCw, Trash2, Save, Download, Lock, Unlock, Sparkles, ChevronDown, BookMarked, Quote } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateAppealLetter } from '../services/geminiService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { getBranding, getStatements } from '../services/assetService.ts';
import { getPolicies } from '../services/policyService.ts';
import { AppealLetterRequest, AppealType, PositionStatement, MedicalPolicy, PracticeBranding } from '../types.ts';

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
      templateType: 'Medical Necessity'
    };
  });

  const [branding, setBranding] = useState<PracticeBranding>(getBranding());
  const [statements, setStatements] = useState<PositionStatement[]>(getStatements());
  const [policies, setPolicies] = useState<MedicalPolicy[]>(getPolicies());
  const [showAssetDrawer, setShowAssetDrawer] = useState<'STATEMENTS' | 'POLICIES' | null>(null);

  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState(() => localStorage.getItem(LETTER_STORAGE_KEY) || '');
  const [copied, setCopied] = useState(false);
  const [secureMode, setSecureMode] = useState(true);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    localStorage.setItem(LETTER_STORAGE_KEY, letter);
  }, [letter]);

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
      // Prepend branding to help the AI format the letter correctly if it has that context
      const generatedLetter = await generateAppealLetter({
        ...formData,
        clinicalEvidence: `[PRACTICE HEADER: ${branding.name}, NPI: ${branding.npi}]\n\n${formData.clinicalEvidence}`
      }, secureMode);
      setLetter(generatedLetter);
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
    
    // Add Branding if exists
    let startY = 20;
    if (branding.logo) {
      try {
        doc.addImage(branding.logo, 'PNG', margin, startY, 40, 40);
        startY += 45;
      } catch (e) { console.error("Logo injection failed", e); }
    }

    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text(branding.name || 'Medical Practice', margin, startY);
    startY += 6;
    doc.setFontSize(10);
    doc.setFont("times", "normal");
    doc.text(branding.address || '', margin, startY);
    startY += 6;
    doc.text(`NPI: ${branding.npi}`, margin, startY);
    startY += 15;

    const splitText = doc.splitTextToSize(letter, pageWidth - margin * 2);
    doc.text(splitText, margin, startY);
    
    const fileName = `Appeal_${formData.patientName.replace(/\s+/g, '_') || 'Letter'}.pdf`;
    doc.save(fileName);

    const user = getCurrentUser();
    if (user) logAction(user, `PDF Downloaded for ${formData.patientName}`, 'POLICY_EXPORT', 'Appeal letter generated and saved');
  };

  const injectAsset = (content: string) => {
    setFormData({
      ...formData,
      clinicalEvidence: `${formData.clinicalEvidence}\n\n${content}`.trim()
    });
    setShowAssetDrawer(null);
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
             <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Appeal Type / Template</label>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Patient Name</label>
                <input type="text" value={formData.patientName} onChange={e => setFormData({...formData, patientName: e.target.value})} placeholder="Jane Doe" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Carrier Name</label>
                <input type="text" value={formData.insuranceProvider} onChange={e => setFormData({...formData, insuranceProvider: e.target.value})} placeholder="e.g. Aetna" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Specific Denial Reason</label>
              <textarea rows={2} value={formData.denialReason} onChange={e => setFormData({...formData, denialReason: e.target.value})} placeholder="Paste exact wording from the EOB or denial letter..." className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Clinical Evidence & Rationale</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowAssetDrawer('STATEMENTS')}
                    className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 hover:underline"
                  >
                    <Quote size={10} /> Position Statements
                  </button>
                  <button 
                    onClick={() => setShowAssetDrawer('POLICIES')}
                    className="text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:underline"
                  >
                    <BookMarked size={10} /> Policy Library
                  </button>
                </div>
              </div>
              <textarea rows={8} value={formData.clinicalEvidence} onChange={e => setFormData({...formData, clinicalEvidence: e.target.value})} placeholder="Insert clinical findings or pull from practice assets..." className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
          </div>

          <button onClick={handleGenerate} disabled={loading} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
            {loading ? 'AI Draft in Progress...' : 'Generate Rebuttal Letter'}
          </button>
        </div>

        <div className="flex flex-col h-full min-h-[500px] relative">
          {showAssetDrawer && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 rounded-2xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right-10 duration-300">
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  {showAssetDrawer === 'STATEMENTS' ? <Quote size={18} /> : <BookMarked size={18} />}
                  Insert {showAssetDrawer === 'STATEMENTS' ? 'Position Statement' : 'Clinical Guideline'}
                </h3>
                <button onClick={() => setShowAssetDrawer(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors"><Trash2 size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {showAssetDrawer === 'STATEMENTS' ? (
                  statements.length > 0 ? statements.map(s => (
                    <button key={s.id} onClick={() => injectAsset(s.content)} className="w-full text-left p-4 hover:bg-slate-50 border border-slate-100 rounded-xl transition-all group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">{s.category}</span>
                        <Sparkles size={12} className="text-slate-200 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <p className="font-bold text-slate-900 text-sm">{s.title}</p>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{s.content}</p>
                    </button>
                  )) : (
                    <div className="p-10 text-center text-slate-400">
                      <p className="text-sm">No position statements saved.</p>
                      <p className="text-[10px] mt-1">Visit Settings to upload reusable clincal stances.</p>
                    </div>
                  )
                ) : (
                  policies.map(p => (
                    <button key={p.id} onClick={() => injectAsset(p.content)} className="w-full text-left p-4 hover:bg-slate-50 border border-slate-100 rounded-xl transition-all group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">{p.carrier}</span>
                      </div>
                      <p className="font-bold text-slate-900 text-sm">{p.title}</p>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{p.content}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

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
              <p className="font-medium">Populate details or insert assets to build a draft.</p>
              <p className="text-xs mt-2 opacity-60 max-w-xs">Our AI will combine your practice positions and insurance rules into a professional appeal.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Appeals;
