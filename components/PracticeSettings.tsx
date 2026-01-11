
import React, { useState, useRef, useEffect } from 'react';
import { 
  Building2, 
  Save, 
  Image as ImageIcon, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Info, 
  X,
  Activity,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { PracticeBranding, PositionStatement, BuildManifest } from '../types.ts';
import { getBranding, saveBranding, getStatements, saveStatement, deleteStatement } from '../services/assetService.ts';

const SYSTEM_MANIFEST: BuildManifest = {
  version: "2.8.4-Clinical",
  features: [
    { id: '1', label: 'Email Appeal Integration', status: 'Active' },
    { id: '2', label: 'Multi-Document Parsing', status: 'Active' },
    { id: '3', label: 'PHI Redaction Engine', status: 'Active' },
    { id: '4', label: 'Audit Logging (SOC2)', status: 'Active' },
    { id: '5', label: 'AI Policy Digestion', status: 'Active' },
  ]
};

const PracticeSettings: React.FC = () => {
  const [branding, setBranding] = useState<PracticeBranding>(() => getBranding());
  const [statements, setStatements] = useState<PositionStatement[]>(() => getStatements());
  const [isAddingStatement, setIsAddingStatement] = useState(false);
  const [editingStatement, setEditingStatement] = useState<PositionStatement | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBranding(getBranding());
    setStatements(getStatements());
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert("Logo must be under 1MB for local storage.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setBranding({ ...branding, logo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveBranding = () => {
    saveBranding(branding);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const handleSaveStatement = (s: PositionStatement) => {
    saveStatement(s);
    setStatements(getStatements());
    setEditingStatement(null);
    setIsAddingStatement(false);
  };

  const handleRemoveStatement = (id: string) => {
    if (window.confirm('Are you sure you want to remove this position statement?')) {
      deleteStatement(id);
      setStatements(getStatements());
    }
  };

  return (
    <div className="space-y-10 pb-20 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">System Settings</h2>
          <p className="text-slate-500">Configure practice branding and verify workstation integrity.</p>
        </div>
        {showSavedToast && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-right-4">
            <CheckCircle2 size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Changes Saved</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-10">
          <section className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <Building2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Office Branding</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personalize letterheads and medical reports.</p>
              </div>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="flex flex-col md:flex-row items-start gap-10">
                <div className="space-y-4 w-full md:w-auto flex flex-col items-center">
                  <label className="block w-full text-[10px] font-black text-slate-400 uppercase tracking-widest text-center md:text-left">Practice Logo</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-40 h-40 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all overflow-hidden shadow-inner"
                  >
                    {branding.logo ? (
                      <img src={branding.logo} alt="Practice Logo" className="w-full h-full object-contain p-4" />
                    ) : (
                      <>
                        <ImageIcon className="text-slate-300 mb-2" size={32} />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Click to Upload</span>
                      </>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Practice Name</label>
                    <input type="text" value={branding.name} onChange={e => setBranding({...branding, name: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Practice Email</label>
                    <input type="email" value={branding.contactEmail} onChange={e => setBranding({...branding, contactEmail: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">NPI (Organization)</label>
                    <input type="text" value={branding.npi} onChange={e => setBranding({...branding, npi: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm tracking-widest" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Office Address</label>
                    <textarea rows={2} value={branding.address} onChange={e => setBranding({...branding, address: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                  </div>
                </div>
              </div>
              <button onClick={handleSaveBranding} className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200">
                <Save size={18} /> Save Practice Assets
              </button>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Position Statements</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Standardized rebuttals for Appeal Builder injection.</p>
                </div>
              </div>
              <button onClick={() => setIsAddingStatement(true)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors flex items-center gap-2">
                <Plus size={16} /> New Rebuttal
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {statements.map(s => (
                <div key={s.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:border-blue-200 transition-all group flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black uppercase rounded tracking-widest">{s.category}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingStatement(s)} className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"><Edit3 size={16} /></button>
                      <button onClick={() => handleRemoveStatement(s.id)} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 mb-2">{s.title}</h4>
                  <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-4 font-medium italic">"{s.content}"</p>
                </div>
              ))}
              {statements.length === 0 && (
                <div className="md:col-span-2 py-20 text-center border-2 border-dashed border-slate-100 rounded-[40px] text-slate-300">
                  <Info className="mx-auto mb-4 opacity-30" size={40} />
                  <p className="font-black uppercase tracking-widest text-[10px]">No Statements Provisioned</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-blue-600 rounded-xl"><Activity size={20} /></div>
              <h3 className="text-sm font-black uppercase tracking-[0.2em]">Build Manifest</h3>
            </div>
            
            <div className="space-y-4">
               <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Version</span>
                  <span className="text-xs font-mono font-bold text-blue-400">{SYSTEM_MANIFEST.version}</span>
               </div>
               
               <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Integrated Features</p>
                  {SYSTEM_MANIFEST.features.map(f => (
                    <div key={f.id} className="flex items-center justify-between group">
                       <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{f.label}</span>
                       <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                          {f.status}
                       </span>
                    </div>
                  ))}
               </div>

               <div className="pt-6 mt-6 border-t border-white/5 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="text-emerald-500" size={16} />
                    <p className="text-[10px] font-bold text-slate-400">Environment Sec-Policy: AES-256</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Cpu className="text-blue-500" size={16} />
                    <p className="text-[10px] font-bold text-slate-400">AI Model: Gemini 3 Flash/Pro</p>
                  </div>
               </div>
            </div>
          </section>
        </div>
      </div>

      {/* Modal for Statement Editing */}
      {(isAddingStatement || editingStatement) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                <h3 className="text-lg font-black uppercase tracking-tight">{editingStatement ? 'Edit Statement' : 'New Statement'}</h3>
                <button onClick={() => { setIsAddingStatement(false); setEditingStatement(null); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
             </div>
             <div className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Title / Reference</label>
                    <input type="text" defaultValue={editingStatement?.title || ''} id="stmt-title" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Category</label>
                    <input type="text" defaultValue={editingStatement?.category || 'Clinical'} id="stmt-cat" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Statement Content</label>
                  <textarea rows={8} id="stmt-content" defaultValue={editingStatement?.content || ''} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium leading-relaxed" />
                </div>
                <button onClick={() => {
                  const title = (document.getElementById('stmt-title') as HTMLInputElement).value;
                  const cat = (document.getElementById('stmt-cat') as HTMLInputElement).value;
                  const content = (document.getElementById('stmt-content') as HTMLTextAreaElement).value;
                  if (title && content) {
                    handleSaveStatement({ id: editingStatement?.id || Date.now().toString(), title, category: cat, content });
                  }
                }} className="w-full py-5 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-3xl shadow-xl">
                  Save Position Statement
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeSettings;
