
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Loader2, AlertCircle, CheckCircle2, ClipboardList, 
  ShieldCheck, Library, ChevronRight, Lock, Unlock, ShieldAlert, 
  FileUp, Bold, Italic, List, Save, Gauge, ArrowRight, Info, X
} from 'lucide-react';
import { analyzeGuidelines, parsePolicyDocument } from '../services/geminiService.ts';
import { searchPolicies } from '../services/policyService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { hasPermission } from '../services/permissionsService.ts';
import { saveRecord } from '../services/historyService.ts';
import { AnalysisResult, MedicalPolicy } from '../types.ts';

const STORAGE_KEY_CPT = 'medauth_analyzer_cpt_draft';
const STORAGE_KEY_NOTES = 'medauth_analyzer_notes_draft';

const Analyzer: React.FC = () => {
  const [cptCode, setCptCode] = useState(() => localStorage.getItem(STORAGE_KEY_CPT) || '');
  const [guidelines, setGuidelines] = useState(''); 
  const [notes, setNotes] = useState(() => localStorage.getItem(STORAGE_KEY_NOTES) || '');

  const [loading, setLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [secureMode, setSecureMode] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  
  const [libSearch, setLibSearch] = useState('');
  const [suggestedPolicies, setSuggestedPolicies] = useState<MedicalPolicy[]>([]);
  const [showLibDropdown, setShowLibDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const user = getCurrentUser();
  const canAnalyze = hasPermission(user, 'run_clinical_analysis');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CPT, cptCode);
    localStorage.setItem(STORAGE_KEY_NOTES, notes);
    if (cptCode.trim() !== '' || notes.trim() !== '') {
      setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else {
      setLastSaved(null);
    }
  }, [cptCode, notes]);

  useEffect(() => {
    if (libSearch.length > 1) {
      setSuggestedPolicies(searchPolicies(libSearch));
      setShowLibDropdown(true);
    } else {
      setShowLibDropdown(false);
    }
  }, [libSearch]);

  const handleAnalyze = async () => {
    const cleanGuidelines = guidelines.replace(/<[^>]*>/g, '\n').trim();
    if (!cleanGuidelines || !notes || !cptCode) return;
    setLoading(true);
    
    try {
      const data = await analyzeGuidelines(cleanGuidelines, notes, cptCode, secureMode);
      setResult(data);
      
      if (user) {
        saveRecord({
          patient: 'PHI Redacted Patient', // In real app, prompt for ID or name
          cpt: cptCode,
          status: data.status,
          result: data.reasoning,
          type: 'Analysis'
        }, user);
        logAction(user, `Analysis completed for CPT ${cptCode}`, 'ANALYSIS', `Outcome: ${data.status}`);
      }
    } catch (error) {
      alert("Analysis failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  const selectPolicy = (p: MedicalPolicy) => {
    const formattedContent = p.content.replace(/\n/g, '<br>');
    setGuidelines(formattedContent);
    if (p.cptCodes.length > 0) setCptCode(p.cptCodes[0]);
    setShowLibDropdown(false);
    setLibSearch(p.title);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const extractedData = await parsePolicyDocument(base64, file.type || 'application/pdf');
        if (extractedData.content) setGuidelines(extractedData.content.replace(/\n/g, '<br>'));
        if (extractedData.cptCodes?.[0]) setCptCode(extractedData.cptCodes[0]);
        setIsParsing(false);
      };
    } catch (error) {
      setIsParsing(false);
    }
  };

  if (!canAnalyze) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-[70vh] text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mb-6">
          <ShieldAlert className="text-amber-600" size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Clinical Permission Required</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-8">Role: {user?.role}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Authorization Analyzer</h2>
          <p className="text-slate-500">Cross-reference documentation against carrier criteria.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${
            secureMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {secureMode ? <Lock size={12} /> : <Unlock size={12} />}
            {secureMode ? 'PHI REDACTION ON' : 'RAW MODE'}
          </div>
          <button onClick={() => { setGuidelines(''); setNotes(''); setCptCode(''); setResult(null); }} className="text-xs font-black text-blue-600 uppercase tracking-widest hover:bg-blue-50 px-4 py-2 rounded-xl transition-all">
            Clear Draft
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
             <div className="relative">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Search Guidelines / Policy</label>
                <Search className="absolute left-4 top-[42px] text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Carrier name, CPT code, or procedure..."
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                />
                {showLibDropdown && suggestedPolicies.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in zoom-in-95">
                    {suggestedPolicies.map(p => (
                      <button key={p.id} onClick={() => selectPolicy(p)} className="w-full text-left p-5 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center justify-between transition-colors">
                        <div>
                          <span className="text-[9px] font-black text-blue-600 uppercase bg-blue-50 px-1.5 py-0.5 rounded mr-3">{p.carrier}</span>
                          <span className="font-bold text-slate-900 text-sm">{p.title}</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Target CPT Code</label>
                <input 
                  type="text" 
                  placeholder="e.g. 72148"
                  value={cptCode}
                  onChange={(e) => setCptCode(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-black font-mono tracking-widest"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Medical Guidelines</label>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-blue-600 hover:underline uppercase tracking-widest">
                    {isParsing ? 'Parsing...' : 'Upload PDF'}
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".pdf,.txt" />
                </div>
                <textarea rows={4} value={guidelines.replace(/<br>/g, '\n')} onChange={e => setGuidelines(e.target.value)} placeholder="Paste policy criteria here..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Patient Clinical Documentation</label>
                <textarea rows={6} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Paste SOAP notes, H&P, or imaging results..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <button onClick={handleAnalyze} disabled={loading || !guidelines || !notes} className="w-full py-5 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-3 transition-all">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                {loading ? 'Evaluating Clinical Necessity...' : 'Check Approval Risk'}
              </button>
          </div>
        </div>

        <div className="space-y-6">
          {!result && !loading ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[40px]">
              <ClipboardList className="text-slate-200 mb-4" size={64} />
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Audit Evaluation</h3>
              <p className="text-slate-400 text-xs max-w-[200px] font-bold uppercase tracking-tighter mt-2">Submit clinical data to determine if authorization criteria are met.</p>
            </div>
          ) : loading ? (
            <div className="bg-white p-16 rounded-[40px] border border-slate-100 shadow-2xl flex flex-col items-center justify-center text-center animate-pulse">
              <Loader2 className="text-blue-500 animate-spin mb-6" size={48} />
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest">Processing Policy Data</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Running medical necessity cross-reference...</p>
            </div>
          ) : result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
              <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-3 ${result.status === 'Likely Approved' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                <div className="flex items-start justify-between mb-8">
                   <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Likelihood Outcome</h3>
                    <p className={`text-3xl font-black ${result.status === 'Likely Approved' ? 'text-emerald-500' : 'text-rose-500'}`}>{result.status}</p>
                   </div>
                   <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black mb-2 uppercase tracking-widest">
                        <Gauge size={14} /> Confidence
                      </div>
                      <div className="relative w-32 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div className={`h-full ${result.status === 'Likely Approved' ? 'bg-emerald-500' : 'bg-rose-500'} transition-all duration-1000`} style={{ width: `${result.confidenceScore}%` }}></div>
                      </div>
                      <span className="text-sm font-black text-slate-900 mt-2">{result.confidenceScore}%</span>
                   </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl mb-8 border border-slate-100/50">
                  <div className="flex items-center gap-2 mb-3 text-slate-900 font-black text-xs uppercase tracking-widest">
                    <Info size={16} className="text-blue-500" /> AI Rationale
                  </div>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed italic">"{result.reasoning}"</p>
                </div>

                <div className="space-y-6">
                  {result.missingRequirements.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <AlertCircle size={14} className="text-rose-500" /> Deficit Identified
                      </h4>
                      <div className="space-y-2">
                        {result.missingRequirements.map((req, i) => (
                          <div key={i} className="flex items-center gap-3 text-[11px] text-slate-700 bg-rose-50/40 p-3 rounded-xl border border-rose-100/50 font-bold">
                            <X size={12} className="text-rose-500 shrink-0" /> {req}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-500" /> Action Checklist
                    </h4>
                    <div className="space-y-2">
                      {result.suggestedActionItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 text-[11px] text-slate-700 bg-emerald-50/40 p-3 rounded-xl border border-emerald-100/50 font-bold">
                          <ArrowRight size={12} className="text-emerald-500 shrink-0" /> {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-2xl flex items-center justify-between group cursor-pointer hover:bg-blue-700 transition-all border border-blue-400/30">
                <div>
                  <p className="font-black text-xl mb-1">Authorization Flagged?</p>
                  <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest">Launch Appeal Builder with this Evidence</p>
                </div>
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center group-hover:bg-white/30 transition-all shadow-inner border border-white/20">
                   <ArrowRight size={28} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analyzer;
