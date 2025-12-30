import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Trash2, Edit3, BookOpen, Clock, Building2, 
  Hash, Pill, FileUp, Loader2, X, Tag as TagIcon, Lock, 
  History, RotateCcw, ChevronRight 
} from 'lucide-react';
import { getPolicies, savePolicy, deletePolicy } from '../services/policyService.ts';
import { parsePolicyDocument } from '../services/geminiService.ts';
import { MedicalPolicy, PolicyHistoryEntry } from '../types.ts';
import { getCurrentUser } from '../services/authService.ts';
import { hasPermission } from '../services/permissionsService.ts';
import { logAction } from '../services/auditService.ts';

const PolicyLibrary: React.FC = () => {
  const [policies, setPolicies] = useState<MedicalPolicy[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Partial<MedicalPolicy> | null>(null);
  const [historyPolicy, setHistoryPolicy] = useState<MedicalPolicy | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const user = getCurrentUser();
  const canManage = hasPermission(user, 'manage_policies');

  useEffect(() => {
    setPolicies(getPolicies());
  }, []);

  const handleSave = () => {
    if (editingPolicy && editingPolicy.carrier && editingPolicy.title) {
      const newPolicy: MedicalPolicy = {
        id: editingPolicy.id || Date.now().toString(),
        carrier: editingPolicy.carrier || '',
        title: editingPolicy.title || '',
        cptCodes: editingPolicy.cptCodes || [],
        medications: editingPolicy.medications || [],
        tags: editingPolicy.tags || [],
        content: editingPolicy.content || '',
        lastUpdated: new Date().toISOString().split('T')[0],
        history: editingPolicy.history || []
      };
      savePolicy(newPolicy);
      
      if (user) {
        logAction(user, `${editingPolicy.id ? 'Updated' : 'Created'} Policy: ${newPolicy.title}`, 'POLICY_EXPORT', `Carrier: ${newPolicy.carrier}`);
      }
      
      setPolicies(getPolicies());
      setEditingPolicy(null);
      setIsAdding(false);
    }
  };

  const handleRestore = (version: PolicyHistoryEntry) => {
    if (!historyPolicy || !window.confirm(`Are you sure you want to restore the version from ${version.timestamp}? The current version will be saved to history.`)) return;

    const restoredPolicy: MedicalPolicy = {
      ...historyPolicy,
      title: version.title,
      content: version.content,
      lastUpdated: new Date().toISOString().split('T')[0],
    };

    savePolicy(restoredPolicy);
    
    if (user) {
      logAction(user, `Restored Policy Version: ${restoredPolicy.title}`, 'POLICY_EXPORT', `Restored from ${version.timestamp}`);
    }

    setPolicies(getPolicies());
    setHistoryPolicy(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/pdf';
      const extractedData = await parsePolicyDocument(base64, mimeType);
      
      setEditingPolicy(prev => ({
        ...prev,
        ...extractedData,
        cptCodes: extractedData.cptCodes || [],
        medications: extractedData.medications || [],
        tags: extractedData.tags || []
      }));
      setIsAdding(true);
    } catch (error) {
      console.error("Parsing failed:", error);
      alert("Failed to parse document. Please ensure it is a clear PDF or text file.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const filtered = policies.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.carrier.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.cptCodes.some(c => c.includes(searchQuery)) ||
    (p.tags && p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Policy Library</h2>
          <p className="text-slate-500">Access and review carrier guidelines.</p>
        </div>
        {canManage && (
          <div className="flex gap-3">
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
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
            >
              {isParsing ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
              {isParsing ? 'Parsing...' : 'Import Document'}
            </button>
            <button 
              onClick={() => {
                setEditingPolicy({ cptCodes: [], medications: [], tags: [], content: '', history: [] });
                setIsAdding(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg"
            >
              <Plus size={18} />
              Add Policy
            </button>
          </div>
        )}
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-xs font-medium">
          <Lock size={14} /> You have view-only access to the policy library. Contact an administrator or medical provider to add or edit guidelines.
        </div>
      )}

      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by carrier, CPT, tags, or medication..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((policy) => (
          <div key={policy.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col hover:border-blue-200 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded tracking-wider flex items-center gap-1">
                <Building2 size={10} />
                {policy.carrier}
              </span>
              {canManage && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => setHistoryPolicy(policy)}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600"
                    title="Version History"
                  >
                    <History size={16} />
                  </button>
                  <button 
                    onClick={() => { setEditingPolicy(policy); setIsAdding(true); }}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600"
                    title="Edit Policy"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button 
                    onClick={() => { if(window.confirm('Delete policy?')) { deletePolicy(policy.id); setPolicies(getPolicies()); } }}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-600"
                    title="Delete Policy"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            <h3 className="font-bold text-slate-900 mb-2">{policy.title}</h3>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {policy.cptCodes.map(c => (
                <span key={c} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-semibold rounded">{c}</span>
              ))}
              {policy.medications.map(m => (
                <span key={m} className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-semibold rounded">{m}</span>
              ))}
            </div>

            <p className="text-sm text-slate-500 line-clamp-3 mb-6 flex-1 italic">
              "{policy.content}"
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-50 text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                Updated {policy.lastUpdated}
              </span>
              {policy.history && policy.history.length > 0 && (
                <span className="text-indigo-500 font-bold">{policy.history.length} versions</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Add Modal */}
      {isAdding && canManage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                {editingPolicy?.id ? 'Edit Medical Policy' : 'Create New Policy'}
              </h3>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Insurance Carrier</label>
                <input 
                  type="text"
                  value={editingPolicy?.carrier || ''}
                  onChange={e => setEditingPolicy({...editingPolicy!, carrier: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Policy Title</label>
                <input 
                  type="text"
                  value={editingPolicy?.title || ''}
                  onChange={e => setEditingPolicy({...editingPolicy!, title: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Clinical Guidelines</label>
              <textarea 
                rows={8}
                value={editingPolicy?.content || ''}
                onChange={e => setEditingPolicy({...editingPolicy!, content: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <button onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleSave} className="px-8 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Save Policy</button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {historyPolicy && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <History className="text-indigo-600" size={24} />
                  Version History
                </h3>
                <p className="text-sm text-slate-500">{historyPolicy.title} ({historyPolicy.carrier})</p>
              </div>
              <button onClick={() => setHistoryPolicy(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {(!historyPolicy.history || historyPolicy.history.length === 0) ? (
                <div className="text-center py-12 text-slate-400">
                  <RotateCcw className="mx-auto mb-2 opacity-20" size={48} />
                  <p>No previous versions available for this policy.</p>
                </div>
              ) : (
                historyPolicy.history.map((version, idx) => (
                  <div key={idx} className="relative pl-8 border-l-2 border-slate-200">
                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-200 ring-4 ring-slate-50" />
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Version v{historyPolicy.history!.length - idx}</span>
                      <span className="text-xs text-slate-400 font-medium">Dated {version.timestamp}</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-100 group">
                      <h4 className="font-bold text-slate-800 text-sm mb-1">{version.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-3 mb-4 leading-relaxed italic">"{version.content}"</p>
                      <button 
                        onClick={() => handleRestore(version)}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        <RotateCcw size={14} /> Restore this version
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setHistoryPolicy(null)}
                className="px-6 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PolicyLibrary;