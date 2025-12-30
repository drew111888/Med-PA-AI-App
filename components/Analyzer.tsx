import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Loader2, AlertCircle, CheckCircle2, ClipboardList, 
  ShieldCheck, Library, ChevronRight, Lock, Unlock, ShieldAlert, 
  FileUp, Bold, Italic, List, Save
} from 'lucide-react';
import { analyzeGuidelines, parsePolicyDocument } from '../services/geminiService.ts';
import { searchPolicies } from '../services/policyService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { hasPermission } from '../services/permissionsService.ts';
import { AnalysisResult, MedicalPolicy } from '../types.ts';

const STORAGE_KEY_CPT = 'medauth_analyzer_cpt_draft';
const STORAGE_KEY_NOTES = 'medauth_analyzer_notes_draft';

const Analyzer: React.FC = () => {
  const [cptCode, setCptCode] = useState(() => localStorage.getItem(STORAGE_KEY_CPT) || '');
  const [guidelines, setGuidelines] = useState(''); // Guidelines are usually pulled from library/PDF, not autosaved
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

  // Auto-save logic
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CPT, cptCode);
    localStorage.setItem(STORAGE_KEY_NOTES, notes);
    if (cptCode || notes) {
      setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
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

  // Sync state when guidelines changed externally (e.g. from Policy Selection)
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
        <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-400 font-mono">
          NPI verification or clinical credentials must be on file to enable this module.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Authorization Analyzer</h2>
          <p className="text-slate-500">Secure cross-referencing of documentation with insurer criteria.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
            secureMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {secureMode ? <Lock size={14} /> : <Unlock size={14} />}
            <span className="text-xs font-bold uppercase tracking-wider">
              Secure Redaction: {secureMode ? 'ACTIVE' : 'WARNING: OFF'}
            </span>
            <button 
              onClick={() => {
                if (secureMode && !window.confirm("WARNING: Disabling Secure Mode will expose raw PHI to the AI processor. This may violate HIPAA unless you have a direct BAA and internal authorization. Proceed?")) return;
                setSecureMode(!secureMode);
              }}
              className={`ml-2 w-8 h-4 rounded-full relative transition-colors ${secureMode ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${secureMode ? 'left-4.5' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {lastSaved && (
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 animate-in fade-in duration-300">
                <Save size={10} /> Draft saved {lastSaved}
              </span>
            )}
            <button 
              onClick={handleClearAll}
              className="text-sm text-blue-600 font-medium hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Library size={16} className="text-blue-500" />
                Quick Search Policy Library
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search by carrier, code, or medication..."
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-blue-50/50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                />
                {showLibDropdown && suggestedPolicies.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {suggestedPolicies.map(p => (
                      <button 
                        key={p.id}
                        onClick={() => selectPolicy(p)}
                        className="w-full text-left p-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center justify-between group"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-1.5 rounded">{p.carrier}</span>
                            <span className="font-bold text-slate-900 text-sm">{p.title}</span>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Procedure / CPT / Drug</label>
              <input 
                type="text" 
                placeholder="e.g. 72148"
                value={cptCode}
                onChange={(e) => setCptCode(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => execCommand('bold')}
                  className="p-1.5 hover:bg-white rounded text-slate-500 hover:text-slate-900 transition-colors"
                  title="Bold"
                >
                  <Bold size={16} />
                </button>
                <button 
                  onClick={() => execCommand('italic')}
                  className="p-1.5 hover:bg-white rounded text-slate-500 hover:text-slate-900 transition-colors"
                  title="Italic"
                >
                  <Italic size={16} />
                </button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button 
                  onClick={() => execCommand('insertUnorderedList')}
                  className="p-1.5 hover:bg-white rounded text-slate-500 hover:text-slate-900 transition-colors"
                  title="Bullet List"
                >
                  <List size={16} />
                </button>
              </div>
              <div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept=".pdf,.txt"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                >
                  {isParsing ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />}
                  {isParsing ? 'PARSING...' : 'UPLOAD PDF'}
                </button>
              </div>
            </div>
            <div className="p-4 relative min-h-[200px]">
              <div
                ref={editorRef}
                contentEditable
                onInput={handleEditorChange}
                className="w-full h-full outline-none text-sm leading-relaxed text-slate-700 rich-text-guidelines"
                data-placeholder="Guidelines will populate here..."
              />
              {!guidelines && (
                <div className="absolute top-4 left-4 text-slate-300 text-sm pointer-events-none italic">
                  Clinical guidelines (from search, PDF, or manual entry)...
                </div>
              )}
            </div>
            <style>{`
              .rich-text-guidelines ul { list-style-type: disc; margin-left: 1.5rem; }
              .rich-text-guidelines ol { list-style-type: decimal; margin-left: 1.5rem; }
            `}</style>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Patient Clinical Notes</label>
            <textarea 
              rows={8}
              placeholder="Paste relevant sections of the clinical documentation..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm leading-relaxed"
            />
            {secureMode && (
              <p className="mt-2 text-[10px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1">
                <Lock size={10} /> Client-Side De-identification Enforced
              </p>
            )}
          </div>

          <button 
            onClick={handleAnalyze}
            disabled={loading || !guidelines || !notes}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
            {loading ? 'Processing Securely...' : 'Run Risk Analysis'}
          </button>
        </div>

        <div className="space-y-6">
          {!result && !loading && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white border border-slate-100 rounded-3xl shadow-sm">
              <ClipboardList className="text-slate-100 mb-4" size={80} />
              <h3 className="text-xl font-bold text-slate-900">Analysis Results</h3>
              <p className="text-slate-400 text-sm max-w-xs mt-2">
                Provide clinical data to evaluate authorization risk.
              </p>
            </div>
          )}

          {loading && (
            <div className="animate-pulse space-y-4">
              <div className="h-32 bg-slate-200 rounded-2xl"></div>
              <div className="h-64 bg-slate-100 rounded-2xl"></div>
            </div>
          )}

          {result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className={`p-8 rounded-3xl border shadow-sm ${
                result.status === 'Likely Approved' ? 'bg-emerald-50 border-emerald-100' : 
                result.status === 'Likely Denied' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest ${
                    result.status === 'Likely Approved' ? 'bg-emerald-200 text-emerald-800' : 
                    result.status === 'Likely Denied' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                  }`}>
                    {result.status}
                  </span>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">AI Confidence</p>
                    <span className="text-lg font-bold text-slate-900">{result.confidenceScore}%</span>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Rationale</h3>
                <p className="text-slate-700 leading-relaxed text-sm">{result.reasoning}</p>
                {secureMode && (
                  <div className="mt-4 pt-4 border-t border-emerald-100 flex items-center justify-between">
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tighter flex items-center gap-1">
                      <Lock size={10} /> Local Re-identification Complete
                    </p>
                    <span className="text-[10px] text-slate-400">Audit ID: {Date.now().toString().slice(-6)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analyzer;