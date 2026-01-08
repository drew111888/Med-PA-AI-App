
import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Lock, ExternalLink, Scale, User, Key, ChevronRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { signAgreement, authenticate } from '../services/authService.ts';
import { User as UserType } from '../types.ts';

interface SecurityGatewayProps {
  onAuthenticated: (user: UserType) => void;
}

const SecurityGateway: React.FC<SecurityGatewayProps> = ({ onAuthenticated }) => {
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Artificial delay to simulate secure verification and prevent brute-force feeling
    setTimeout(() => {
      const user = authenticate(username, password);
      if (user) {
        signAgreement();
        onAuthenticated(user);
      } else {
        setError("Invalid credentials. Please verify your username and password.");
        setIsSubmitting(false);
      }
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[9999] overflow-y-auto">
      <div className="bg-white max-w-lg w-full rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 my-auto">
        <div className="p-10 bg-blue-600 text-white text-center relative">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/20">
            <Lock size={32} />
          </div>
          <h2 className="text-3xl font-black tracking-tight">Practice Login</h2>
          <p className="text-blue-100 mt-2 text-sm font-medium uppercase tracking-widest">Secure Entry Point</p>
        </div>

        <div className="p-10 space-y-8">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="flex gap-4 p-6 bg-amber-50 rounded-[32px] border border-amber-100/50">
                <Scale className="text-amber-600 flex-shrink-0" size={24} />
                <div className="text-sm text-amber-900 leading-relaxed">
                  <p className="font-black uppercase tracking-widest text-[10px] mb-2">Legal Compliance Verification</p>
                  <p className="font-medium">You are accessing a secure medical environment. By proceeding, you confirm your organization's active BAA and your authorization to handle PHI under HIPAA.</p>
                </div>
              </div>

              <label className="flex items-center gap-4 p-5 bg-slate-50 rounded-[24px] border border-slate-200 cursor-pointer hover:bg-slate-100 transition-all group">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${agreed ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                  {agreed && <ShieldCheck size={14} className="text-white" />}
                </div>
                <input 
                  type="checkbox" 
                  checked={agreed} 
                  onChange={e => setAgreed(e.target.checked)}
                  className="hidden"
                />
                <div className="text-sm text-slate-700 font-bold">
                  I acknowledge and agree to HIPAA data processing terms.
                </div>
              </label>

              <button 
                disabled={!agreed}
                onClick={() => setStep(2)}
                className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl disabled:opacity-30 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
              >
                Proceed to Secure Login <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6 animate-in slide-in-from-right-8 duration-500">
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-600 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-bold">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      required
                      autoFocus
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. jsmith"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 transition-all"
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

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all text-xs uppercase"
                >
                  Back
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting || !username || !password}
                  className="flex-1 py-5 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isSubmitting ? "Verifying..." : "Sign In to Workstation"}
                </button>
              </div>
            </form>
          )}

          <div className="pt-6 border-t border-slate-100 flex flex-col items-center gap-4">
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1.5 font-black uppercase tracking-widest"
            >
              Security Protocols & BAA <ExternalLink size={10} />
            </a>
            <p className="text-[10px] text-slate-300 font-medium">Practice Workstation V2.6 • HIPAA Secure Layer</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityGateway;
