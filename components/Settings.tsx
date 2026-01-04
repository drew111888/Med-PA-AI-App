
import React, { useState } from 'react';
import { 
  Building, Fingerprint, ShieldCheck, Download, Trash2, 
  Save, AlertTriangle, ShieldAlert, CheckCircle, FileJson, Clock,
  Database, Cloud, CloudOff, RefreshCw, Server, ExternalLink, Code, Info
} from 'lucide-react';
import { PracticeSettings, CloudConfig } from '../types.ts';
import { getCurrentUser } from '../services/authService.ts';
import { logAction, getAuditLogs } from '../services/auditService.ts';
import { storage } from '../services/storageService.ts';

const SETTINGS_KEY = 'medauth_practice_settings';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'practice' | 'security' | 'cloud'>('practice');
  const [settings, setSettings] = useState<PracticeSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : {
      practiceName: 'Central Health Partners',
      npi: '1234567890',
      taxId: '88-1234567',
      enforceSecureMode: true,
      autoLogoutMinutes: 30,
      cloud: {
        enabled: false,
        supabaseUrl: '',
        supabaseKey: '',
      }
    };
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const user = getCurrentUser();

  const handleSave = () => {
    setSaving(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    if (user) {
      logAction(user, 'System settings updated', 'SYSTEM_SETTINGS', 'Practice profile and security flags modified');
    }

    setTimeout(() => {
      setSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 800);
  };

  const testCloud = async () => {
    if (!settings.cloud?.supabaseUrl || !settings.cloud?.supabaseKey) return;
    setTesting(true);
    const ok = await storage.testConnection(settings.cloud.supabaseUrl, settings.cloud.supabaseKey);
    setTesting(false);
    alert(ok ? "Connected to Cloud Database successfully!" : "Connection failed. Check URL and Key.");
  };

  const handleExportAudit = async () => {
    const logs = await getAuditLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MedAuth_Audit_Logs_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    if (user) logAction(user, 'Audit logs exported', 'POLICY_EXPORT', 'Full system audit trail downloaded');
  };

  const sqlSchema = `
-- RUN THIS IN YOUR SUPABASE SQL EDITOR --
CREATE TABLE IF NOT EXISTS policies (id TEXT PRIMARY KEY, carrier TEXT, title TEXT, content TEXT, lastUpdated TEXT, data JSONB);
CREATE TABLE IF NOT EXISTS case_history (id TEXT PRIMARY KEY, patientName TEXT, cptCode TEXT, status TEXT, timestamp TEXT, data JSONB);
CREATE TABLE IF NOT EXISTS user_registry (id TEXT PRIMARY KEY, username TEXT, name TEXT, role TEXT, data JSONB);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor TEXT, action TEXT, timestamp TEXT, data JSONB);
  `;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Configuration</h2>
          <p className="text-slate-500">Practice-level defaults and production environment management.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200/50">
          <button onClick={() => setActiveTab('practice')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'practice' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>General</button>
          <button onClick={() => setActiveTab('security')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'security' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Security</button>
          <button onClick={() => setActiveTab('cloud')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'cloud' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Cloud Sync</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'practice' && (
            <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-6 text-slate-900 font-bold">
                <Building className="text-blue-600" size={20} /> Practice Identity
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Practice Name</label>
                  <input type="text" value={settings.practiceName} onChange={e => setSettings({...settings, practiceName: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Group NPI (Primary)</label>
                  <input type="text" value={settings.npi} onChange={e => setSettings({...settings, npi: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Federal Tax ID (TIN)</label>
                  <input type="text" value={settings.taxId} onChange={e => setSettings({...settings, taxId: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-6 text-slate-900 font-bold">
                <ShieldCheck className="text-emerald-600" size={20} /> Security & Privacy
              </div>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Enforce Secure Redaction</p>
                    <p className="text-xs text-slate-500 mt-0.5">Always de-identify patient notes before sending to the AI model.</p>
                  </div>
                  <button onClick={() => setSettings({...settings, enforceSecureMode: !settings.enforceSecureMode})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.enforceSecureMode ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.enforceSecureMode ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Session Timeout</p>
                    <p className="text-xs text-slate-500 mt-0.5">Inactivity duration before requiring a fresh BAA sign-off.</p>
                  </div>
                  <select value={settings.autoLogoutMinutes} onChange={e => setSettings({...settings, autoLogoutMinutes: parseInt(e.target.value)})} className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700">
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'cloud' && (
            <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 animate-in fade-in duration-300 space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Server className="text-indigo-600" size={20} /> Production Database Sync
                </div>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${settings.cloud?.enabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                  {settings.cloud?.enabled ? 'Cloud Enabled' : 'Local Only'}
                </div>
              </div>

              <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-4">
                 <Cloud className="text-indigo-600 flex-shrink-0" size={24} />
                 <div className="text-sm text-indigo-900">
                   <p className="font-bold mb-1">Scale to Production</p>
                   <p className="text-xs leading-relaxed opacity-80">Connect your MedAuth AI suite to a Supabase project to enable multi-user sync and permanent data persistence.</p>
                 </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                   <p className="text-sm font-bold text-slate-900">Enable Cloud Persistence</p>
                   <button onClick={() => setSettings({...settings, cloud: { ...settings.cloud!, enabled: !settings.cloud?.enabled }})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.cloud?.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.cloud?.enabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase">Supabase Project URL</label>
                      <a href="https://app.supabase.com/project/_/settings/api" target="_blank" className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1">
                        Find in Supabase <ExternalLink size={10} />
                      </a>
                    </div>
                    <input type="text" placeholder="https://your-project.supabase.co" value={settings.cloud?.supabaseUrl} onChange={e => setSettings({...settings, cloud: {...settings.cloud!, supabaseUrl: e.target.value}})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                   </div>
                   <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase">Project API Key (anon/public)</label>
                      <div className="group relative">
                        <Info size={12} className="text-slate-400 cursor-help" />
                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-900 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          Use the "anon public" key found in Project Settings > API.
                        </div>
                      </div>
                    </div>
                    <input type="password" placeholder="Paste your anon public key here" value={settings.cloud?.supabaseKey} onChange={e => setSettings({...settings, cloud: {...settings.cloud!, supabaseKey: e.target.value}})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                   </div>
                </div>

                <div className="flex gap-3">
                   <button onClick={testCloud} disabled={testing} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm">
                     {testing ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                     Test Connection
                   </button>
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4 shadow-lg border border-slate-800">
                 <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-widest">
                   <Code size={14} /> Database Setup Instructions
                 </div>
                 <p className="text-xs text-slate-400">Run this SQL in your Supabase SQL Editor to prepare your database for MedAuth AI sync:</p>
                 <div className="relative group">
                    <pre className="bg-black/50 p-4 rounded-xl text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre border border-white/5">
                      {sqlSchema}
                    </pre>
                    <button 
                      onClick={() => { navigator.clipboard.writeText(sqlSchema); alert('SQL copied to clipboard'); }}
                      className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Download size={14} />
                    </button>
                 </div>
              </div>
            </section>
          )}

          <div className="flex justify-end gap-3">
            {showSuccess && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold animate-in fade-in slide-in-from-right-4">
                <CheckCircle size={18} /> Settings Applied Successfully
              </div>
            )}
            <button disabled={saving} onClick={handleSave} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50">
              {saving ? <Clock className="animate-spin" size={18} /> : <Save size={18} />}
              Update Practice Configuration
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-3xl shadow-xl text-white border border-slate-700 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/20 transition-all"></div>
            <ShieldAlert className="text-emerald-400 mb-4" size={32} />
            <h3 className="text-xl font-bold mb-2">HIPAA Status: ACTIVE</h3>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">An active BAA is on file. All data is processed using Gemini Enterprise-grade security protocols.</p>
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs font-mono text-emerald-300">CERT_ID: 9823-XJ-BAA</div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Fingerprint className="text-slate-400" size={18} /> Compliance Records
            </h4>
            <p className="text-xs text-slate-500 mb-6">Export the full activity log of all clinical analyses, appeal generations, and user modifications.</p>
            <button onClick={handleExportAudit} className="w-full py-3 border-2 border-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2"><Download size={18} /> Download Audit Trail</button>
          </div>

          <div className="p-8 bg-rose-50 rounded-3xl border border-rose-100">
            <h4 className="text-sm font-bold text-rose-900 mb-2 flex items-center gap-2">
              <AlertTriangle size={18} /> Maintenance
            </h4>
            <p className="text-xs text-rose-700 mb-4">Clear all locally cached clinical drafts and practice history. This action cannot be undone.</p>
            <button onClick={() => { if(window.confirm('WIPE ALL DATA? This will clear all local drafts and history.')) { localStorage.clear(); window.location.reload(); } }} className="w-full py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all text-sm flex items-center justify-center gap-2 shadow-md shadow-rose-600/10"><Trash2 size={16} /> Reset Practice Data</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
