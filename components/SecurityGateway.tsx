
import React, { useState } from 'react';
import { ShieldAlert, Lock, ExternalLink, Scale, UserCircle, Key, ChevronRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { signAgreement, authenticate, isAgreementSigned } from '../services/authService.ts';
import { User } from '../types.ts';

interface SecurityGatewayProps {
  onAuthenticated: (user: User) => void;
}

const SecurityGateway: React.FC<SecurityGatewayProps> = ({ onAuthenticated }) => {
  const [agreed, setAgreed] = useState(isAgreementSigned());
  const [step, setStep] = useState(agreed ? 2 : 1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Artificial delay to simulate secure auth
    setTimeout(() => {
      const user = authenticate(username, password);
      if (user) {
        signAgreement();
        onAuthenticated(user);
      } else {
        setError("Invalid username or password. Please contact your practice administrator.");
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 z-[9999]">
      <div className="bg-white max-w-lg w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-10 bg-blue-600 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-400/20 to-transparent"></div>
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md shadow-inner relative z-10">
            <ShieldAlert size={40} />
          </div>
          <h2 className="text-3xl font-black tracking-tight relative z-10">Secure Gateway</h2>
          <p className="text-blue-100 mt-2 text-sm font-medium relative z-10">Practice Authorization Required</p>
        </div>

        <div className="p-10 space-y-8">
          {step === 1 ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex gap-4 p-5 bg-amber-50 rounded-2xl border border-amber-100/50">
                <Scale className="text-amber-600 flex-shrink-0" size={24} />
                <div className="text-sm text-amber-900 leading-relaxed">
                  <p className="font-bold mb-1">Compliance Requirement</p>
                  <p>By proceeding, you verify your organization has a Business Associate Agreement (BAA) in place for HIPAA-compliant AI processing.</p>
                </div>
              </div>

              <label className="flex items-start gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-all group">
                <div className="mt-1 relative flex items-center justify-center">
                  <input 
                    type="checkbox" 
                    checked={agreed} 
                    onChange={e => setAgreed(e.target.checked)}
                    className="w-5 h-5 rounded-md text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                <div className="text-sm text-slate-700 font-semibold select-none group-hover:text-slate-900 transition-colors">
                  I accept organizational responsibility for HIPAA and BAA data compliance within MedAuth AI.
                </div>
              </label>

              <button 
                disabled={!agreed}
                onClick={() => setStep(2)}
                className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center gap-3"
              >
                Proceed to Secure Login <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6 animate-in slide-in-from-right-8 duration-500">
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-sm flex items-center gap-3 font-medium animate-in shake duration-300">
                  <AlertCircle size={18} className="flex-shrink-0" /> {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Practice Username</label>
                  <div className="relative group">
                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input 
                      required
                      autoFocus
                      type="text" 
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. j.bashir"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Secure Password</label>
                  <div className="relative group">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input 
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <button 
                disabled={loading || !username || !password}
                type="submit"
                className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? "Verifying Credentials..." : "Sign into Workstation"} 
                {!loading && <Lock size={18} />}
              </button>

              <button 
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-xs text-slate-400 font-bold hover:text-slate-600 transition-colors"
              >
                Back to Compliance Notice
              </button>
            </form>
          )}

          <div className="pt-6 border-t border-slate-100 flex flex-col items-center gap-3">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Enterprise Security Active</p>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              className="text-xs text-blue-600 hover:underline flex items-center gap-1.5 font-bold"
            >
              Verify Compliance Standards <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityGateway;
