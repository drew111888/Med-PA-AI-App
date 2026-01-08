
import React, { useState, useEffect, useRef } from 'react';
import { Building2, Save, FileUp, Image as ImageIcon, Plus, Trash2, Edit3, CheckCircle2, Info } from 'lucide-react';
import { PracticeBranding, PositionStatement } from '../types.ts';
import { getBranding, saveBranding, getStatements, saveStatement, deleteStatement } from '../services/assetService.ts';

const Settings: React.FC = () => {
  const [branding, setBranding] = useState<PracticeBranding>(getBranding());
  const [statements, setStatements] = useState<PositionStatement[]>(getStatements());
  const [isAddingStatement, setIsAddingStatement] = useState(false);
  const [editingStatement, setEditingStatement] = useState<PositionStatement | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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

  return (
    <div className="space-y-10 pb-20 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Settings</h2>
          <p className="text-slate-500">Configure practice branding and reusable position statements.</p>
        </div>
        {showSavedToast && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-right-4">
            <CheckCircle2 size={16} />
            <span className="text-sm font-bold uppercase tracking-wider">Changes Saved</span>
          </div>
        )}
      </div>

      {/* Office Branding Section */}
      <section className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Building2 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Office Branding</h3>
            <p className="text-xs text-slate-400">Used for letterheads and professional exports.</p>
          </div>
        </div>
        
        <div className="p-10 space-y-8">
          <div className="flex items-start gap-10">
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Practice Logo</label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-40 h-40 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all overflow-hidden"
              >
                {branding.logo ? (
                  <img src={branding.logo} alt="Practice Logo" className="w-full h-full object-contain p-4" />
                ) : (
                  <>
                    <ImageIcon className="text-slate-300 mb-2" size={32} />
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Click to Upload</span>
                  </>
                )}
              </div>
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Practice Name</label>
                <input 
                  type="text" 
                  value={branding.name}
                  onChange={e => setBranding({...branding, name: e.target.value})}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">NPI (Organization)</label>
                <input 
                  type="text" 
                  value={branding.npi}
                  onChange={e => setBranding({...branding, npi: e.target.value})}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Office Address</label>
                <textarea 
                  rows={2}
                  value={branding.address}
                  onChange={e => setBranding({...branding, address: e.target.value})}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
          <button 
            onClick={handleSaveBranding}
            className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <Save size={18} /> Update Practice Assets
          </button>
        </div>
      </section>

      {/* Position Statements Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Plus size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Position Statements</h3>
              <p className="text-xs text-slate-400">Standardized clinical rebuttals for quick injection.</p>
            </div>
          </div>
          <button 
            onClick={() => setIsAddingStatement(true)}
            className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> New Statement
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {statements.map(s => (
            <div key={s.id} className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm hover:border-blue-200 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <span className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded tracking-widest">{s.category}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingStatement(s)} className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"><Edit3 size={16} /></button>
                  <button onClick={() => { if(window.confirm('Delete this statement?')) { deleteStatement(s.id); setStatements(getStatements()); } }} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
              <h4 className="font-bold text-slate-900 mb-2">{s.title}</h4>
              <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{s.content}</p>
            </div>
          ))}
          {statements.length === 0 && !isAddingStatement && (
            <div className="md:col-span-2 p-12 text-center border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400">
              <Info className="mx-auto mb-4 opacity-30" size={40} />
              <p className="font-bold text-sm">No position statements found.</p>
              <p className="text-xs mt-1">Upload standard clinic positions to use them in the Appeal Builder.</p>
            </div>
          )}
        </div>
      </section>

      {/* Statement Modal */}
      {(isAddingStatement || editingStatement) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                <h3 className="text-xl font-bold">{editingStatement ? 'Edit Position Statement' : 'New Position Statement'}</h3>
                <button onClick={() => { setIsAddingStatement(false); setEditingStatement(null); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Trash2 size={24} /></button>
             </div>
             <div className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Title / Reference</label>
                    <input 
                      type="text" 
                      defaultValue={editingStatement?.title || ''}
                      id="stmt-title"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                    <input 
                      type="text" 
                      defaultValue={editingStatement?.category || 'Clinical'}
                      id="stmt-cat"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Statement Content</label>
                  <textarea 
                    rows={8}
                    id="stmt-content"
                    defaultValue={editingStatement?.content || ''}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm leading-relaxed"
                  />
                </div>
                <button 
                  onClick={() => {
                    const title = (document.getElementById('stmt-title') as HTMLInputElement).value;
                    const cat = (document.getElementById('stmt-cat') as HTMLInputElement).value;
                    const content = (document.getElementById('stmt-content') as HTMLTextAreaElement).value;
                    handleSaveStatement({
                      id: editingStatement?.id || Date.now().toString(),
                      title,
                      category: cat,
                      content
                    });
                  }}
                  className="w-full py-5 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-3xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                >
                  Save Position Statement
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
