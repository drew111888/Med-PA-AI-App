
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
import { saveCaseRecord } from '../services/historyService.ts';
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

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== guidelines) {
      editorRef.current.innerHTML = guidelines;
    }
  }, [guidelines]);

  const selectPolicy = (p: MedicalPolicy) => {
    const formattedContent = p.content.replace(/\n/g, '<br>');
    setGuidelines(formattedContent);
    if (p.cptCodes.length > 0) setCptCode(p.cptCodes[0]);
    setShowLibDropdown(false);
    setLibSearch(p.title);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/pdf';
      const extractedData = await parsePolicyDocument(base64, mimeType);
      
      if (extractedData.content) {
        setGuidelines(extractedData.content.replace(/\n/g, '<br>'));
      }
      if (extractedData.cptCodes && extractedData.cptCodes.length > 0) {
        setCptCode(extractedData.cptCodes[0]);
      }
      if (extractedData.carrier || extractedData.title) {
        setLibSearch(`${extractedData.carrier || ''} ${extractedData.title || ''}`.trim());
      }
      
      if (user) {
        logAction(user, `Guideline document parsed: ${file.name}`, 'ANALYSIS', 'PDF guidelines imported to analyzer');
      }
    } catch (error) {
      console.error("Parsing failed:", error);
      alert("Failed to parse document. Please ensure it is a clear PDF or text file.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEditorChange = () => {
    if (editorRef.current) {
      setGuidelines(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command: string) => {
    document.execCommand(command, false, undefined);
    if (editorRef.current) editorRef.current.focus();
  };

  const handleAnalyze = async () => {
    const cleanGuidelines = guidelines.replace(/<[^>]*>/g, '\n').trim();
    if (!cleanGuidelines || !notes || !cptCode) return;
    setLoading(true);
    
    if (user) {
      logAction(user, `Analysis initiated for CPT ${cptCode}`, 'ANALYSIS', `Secure Mode: ${secureMode}`);
    }

    try {
      const data = await analyzeGuidelines(cleanGuidelines, notes, cptCode, secureMode);
      setResult(data);
      
      // Save to case history
      saveCaseRecord({
        patientName: 'Clinical Case', // We de-identify by default
        cptCode: cptCode,
        type: 'Analysis',
        status: data.status,
        details: { confidence: data.confidenceScore }
      });

    } catch (error) {
      console.error(error);
      alert("Analysis failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear the current analysis and saved draft?")) {
      setResult(null); 
      setGuidelines(''); 
      if (editorRef.current) editorRef.current.innerHTML = '';
      setNotes(''); 
      setCptCode(''); 
      setLibSearch('');
      localStorage.removeItem(STORAGE_KEY_CPT);
      localStorage.removeItem(STORAGE_KEY_NOTES);
      setLastSaved(null);
    }
  };

  const getRiskColor = (status: string) => {
    if (status === 'Likely Approved') return 'text-emerald-500';
    if (status === 'Likely Denied') return 'text-rose-500';
    return 'text-amber-500';
  };

  const getRiskBg = (status: string) => {
    if (status === 'Likely Approved') return 'bg-emerald-500';
    if (status === 'Likely Denied') return 'bg-rose-500';
    return 'bg-amber-500';
  };

  if (!canAnalyze) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-[70vh] text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mb-6">
          <ShieldAlert className="text-amber-600" size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Clinical Permission Required</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-8">
          Performing a medical necessity analysis requires clinical authorization. Your current role ({user?.role}) does not have permission to access this tool.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Authorization Analyzer</h2>
          <p className="text-slate-500">Cross-reference documentation against carrier criteria.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
            secureMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {secureMode ? <Lock size={14} /> : <Unlock size={14} />}
            <span className="text-xs font-bold uppercase tracking-wider">
              Secure Redaction: {secureMode ? 'ACTIVE' : 'OFF'}
            </span>
            <button 
              onClick={() => {
                if (secureMode && !window.confirm("WARNING: Disabling Secure Mode exposing raw PHI to the AI processor. Proceed?")) return;
                setSecureMode(!secureMode);
              }}
              className={`ml-2 w-8 h-4 rounded-full relative transition-colors ${secureMode ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${secureMode ? 'left-4.5' : 'left-0.5'}`} />
            </button>
          </div>
          <button onClick={handleClearAll} className="text-sm text-blue-600 font-medium hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors">
            Clear Draft
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
             <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Library size={16} className="text-blue-500" /> Policy Library
                </label>
                <Search className="absolute left-3 top-[38px] text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search carrier or CPT..."
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                />
                {showLibDropdown && suggestedPolicies.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    {suggestedPolicies.map(p => (
                      <button key={p.id} onClick={() => selectPolicy(p)} className="w-full text-left p-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-1.5 rounded mr-2">{p.carrier}</span>
                          <span className="font-bold text-slate-900 text-sm">{p.title}</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">CPT Code / Procedure</label>
                <input 
                  type="text" 
                  placeholder="e.g. 72148"
                  value={cptCode}
                  onChange={(e) => setCptCode(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden group">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button onClick={() => execCommand('bold')} className="p-1.5 hover:bg-white rounded text-slate-500 hover:text-slate-900 transition-colors"><Bold size={16} /></button>
                <button onClick={() => execCommand('italic')} className="p-1.5 hover:bg-white rounded text-slate-500 hover:text-slate-900 transition-colors"><Italic size={16} /></button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-white rounded text-slate-500 hover:text-slate-900 transition-colors"><List size={16} /></button>
              </div>
              <div>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt" />
                <button onClick={() => fileInputRef.current?.click()} disabled={isParsing} className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                  {isParsing ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />}
                  IMPORT PDF
                </button>
              </div>
            </div>
            <div className="p-4 relative min-h-[180px]">
              <div ref={editorRef} contentEditable onInput={handleEditorChange} className="w-full h-full outline-none text-sm leading-relaxed text-slate-700 rich-text-guidelines" />
              {!guidelines && <div className="absolute top-4 left-4 text-slate-300 text-sm pointer-events-none italic">Paste or import medical policy text here...</div>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Patient Documentation / Notes</label>
            <textarea rows={6} placeholder="Paste progress notes, history and physical, imaging reports..." value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm leading-relaxed" />
          </div>

          <button onClick={handleAnalyze} disabled={loading || !guidelines || !notes} className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
            {loading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
            {loading ? 'Analyzing Clinicals...' : 'Check Approval Risk'}
          </button>
        </div>

        <div className="space-y-6">
          {!result && !loading && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white border border-slate-100 rounded-3xl shadow-sm border-dashed">
              <ClipboardList className="text-slate-200 mb-4" size={64} />
              <h3 className="text-lg font-bold text-slate-900">Pre-Authorization Audit</h3>
              <p className="text-slate-400 text-sm max-w-xs mt-2">Submit clinical notes to evaluate if insurance requirements are met.</p>
            </div>
          )}

          {loading && (
            <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center animate-pulse">
              <Loader2 className="text-blue-500 animate-spin mb-4" size={40} />
              <p className="font-bold text-slate-900">Comparing to Carrier Policy...</p>
              <p className="text-sm text-slate-500 mt-2">AI is evaluating clinical necessity markers.</p>
            </div>
          )}

          {result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-2 ${getRiskBg(result.status)}`}></div>
                <div className="flex items-start justify-between mb-8">
                   <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Authorization Risk</h3>
                    <p className={`text-2xl font-black ${getRiskColor(result.status)}`}>{result.status}</p>
                   </div>
                   <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold mb-2 uppercase">
                        <Gauge size={14} /> Confidence
                      </div>
                      <div className="relative w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${getRiskBg(result.status)} transition-all duration-1000`} style={{ width: `${result.confidenceScore}%` }}></div>
                      </div>
                      <span className="text-sm font-bold text-slate-900 mt-1">{result.confidenceScore}%</span>
                   </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl mb-6">
                  <div className="flex items-center gap-2 mb-2 text-slate-900 font-bold">
                    <Info size={16} className="text-blue-500" /> Clinical Rationale
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed italic">"{result.reasoning}"</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <AlertCircle size={14} className="text-rose-500" /> Missing Documentation
                    </h4>
                    <div className="space-y-2">
                      {result.missingRequirements.map((req, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-rose-50/50 p-2 rounded-lg border border-rose-100/30">
                          <X size={12} className="text-rose-500" /> {req}
                        </div>
                      ))}
                      {result.missingRequirements.length === 0 && (
                        <div className="text-sm text-emerald-600 font-medium">No documentation gaps identified.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-500" /> Action Checklist
                    </h4>
                    <div className="space-y-2">
                      {result.suggestedActionItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/30">
                          <ArrowRight size={12} className="text-emerald-500" /> {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg flex items-center justify-between group cursor-pointer hover:bg-blue-700 transition-all">
                <div>
                  <p className="font-bold text-lg">Likely Denial?</p>
                  <p className="text-blue-100 text-sm">Draft an evidence-based appeal letter now.</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-all">
                   <ArrowRight size={24} />
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
