import React, { useState, useEffect } from 'react';
import { Send, Copy, Check, FileText, Loader2, RefreshCw, Trash2, Save, Download, Lock, Unlock } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateAppealLetter } from '../services/geminiService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';
import { AppealLetterRequest } from '../types.ts';

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
      cptCode: ''
    };
  });

  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState(() => {
    return localStorage.getItem(LETTER_STORAGE_KEY) || '';
  });
  const [copied, setCopied] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [secureMode, setSecureMode] = useState(true);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    setLastSaved(new Date().toLocaleTimeString());
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
      logAction(user, `Appeal generated for ${formData.patientName}`, 'APPEAL', `Secure Mode: ${secureMode}`);
    }

    try {
      const generatedLetter = await generateAppealLetter(formData, secureMode);
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
    const splitText = doc.splitTextToSize(letter, pageWidth - margin * 2);
    
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text(splitText, margin, 25);
    
    const fileName = `Appeal_${formData.patientName.replace(/\s+/g, '_') || 'Letter'}.pdf`;
    doc.save(fileName);

    const user = getCurrentUser();
    if (user) logAction(user, `PDF Downloaded for ${formData.patientName}`, 'POLICY_EXPORT', 'Appeal letter saved to local disk');
  };

  const resetDraft = () => {
    if (window.confirm("Clear draft?")) {
      setFormData({
        patientName: '',
        policyNumber: '',
        insuranceProvider: '',
        denialReason: '',
        clinicalEvidence: '',
        cptCode: ''
      });
      setLetter('');
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LETTER_STORAGE_KEY);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Appeal Builder</h2>
          <p className="text-slate-500">Generate clinically-supported appeal templates securely.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
            secureMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {secureMode ? <Lock size={14} /> : <Unlock size={14} />}
            <span className="text-xs font-bold uppercase tracking-wider">
              PHI Privacy: {secureMode ? 'ENFORCED' : 'EXPOSED'}
            </span>
            <button 
              onClick={() => {
                if (secureMode && !window.confirm("Warning: Disabling privacy mode will send raw PHI to the cloud. Proceed?")) return;
                setSecureMode(!secureMode);
              }}
              className={`ml-2 w-8 h-4 rounded-full relative transition-colors ${secureMode ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${secureMode ? 'left-4.5' : 'left-0.5'}`} />
            </button>
          </div>
          <button 
            onClick={resetDraft}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Patient Name</label>
              <input 
                type="text"
                value={formData.patientName}
                onChange={e => setFormData({...formData, patientName: e.target.value})}
                placeholder="Jane Doe"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Policy Number</label>
              <input 
                type="text"
                value={formData.policyNumber}
                onChange={e => setFormData({...formData, policyNumber: e.target.value})}
                placeholder="ID: 123456789"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Denial Reason</label>
            <textarea 
              rows={3}
              value={formData.denialReason}
              onChange={e => setFormData({...formData, denialReason: e.target.value})}
              placeholder="e.g. Documentation does not support conservative management failure..."
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Clinical Evidence</label>
            <textarea 
              rows={6}
              value={formData.clinicalEvidence}
              onChange={e => setFormData({...formData, clinicalEvidence: e.target.value})}
              placeholder="Briefly summarize why this is medically necessary..."
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button 
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
            {loading ? 'Processing Privately...' : 'Build Appeal Letter'}
          </button>
        </div>

        <div className="flex flex-col h-full">
          {letter ? (
            <div className="bg-white flex-1 rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Draft</span>
                  {secureMode && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Secure-Reidentifed</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={downloadAsPDF} className="p-2 hover:bg-slate-200 rounded-lg text-slate-600">
                    <Download size={16} />
                  </button>
                  <button onClick={copyToClipboard} className="p-2 hover:bg-slate-200 rounded-lg text-slate-600">
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex-1 p-8 overflow-y-auto font-serif text-slate-800 leading-relaxed whitespace-pre-wrap text-sm">
                {letter}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 flex-1 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <Send size={48} className="mb-4 opacity-20" />
              <p>Complete the form to draft an appeal.</p>
              {secureMode && <p className="text-[10px] text-emerald-600 mt-2 font-bold uppercase tracking-wider flex items-center gap-1"><Lock size={10} /> Secure Mode Enabled</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Appeals;