
import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Lock, ExternalLink, Scale, UserCircle, Briefcase, Settings, ChevronRight, UserCheck } from 'lucide-react';
import { signAgreement, login } from '../services/authService.ts';
import { getAllUsers } from '../services/userService.ts';
import { User } from '../types.ts';

interface SecurityGatewayProps {
  onAuthenticated: (user: User) => void;
}

const SecurityGateway: React.FC<SecurityGatewayProps> = ({ onAuthenticated }) => {
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState(1);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    setUsers(getAllUsers());
  }, []);

  const handleComplete = () => {
    const user = users.find(u => u.id === selectedUserId);
    if (user) {
      signAgreement();
      const authenticatedUser = login(true, user);
      if (authenticatedUser) onAuthenticated(authenticatedUser);
    }
  };

  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'ADMIN': return <Settings size={18} />;
      case 'PROVIDER': return <UserCircle size={18} />;
      case 'BILLER': return <Briefcase size={18} />;
      default: return <UserCircle size={18} />;
    }
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'ADMIN': return 'text-purple-600 bg-purple-50 border-purple-100';
      case 'PROVIDER': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'BILLER': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      default: return 'text-slate-600 bg-slate-50 border-slate-100';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[9999] overflow-y-auto">
      <div className="bg-white max-w-xl w-full rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 my-auto">
        <div className="p-10 bg-blue-600 text-white text-center relative">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/20">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-3xl font-black tracking-tight">System Gateway</h2>
          <p className="text-blue-100 mt-2 text-sm font-medium">Secure Practice Access Protocol</p>
        </div>

        <div className="p-10 space-y-8">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="flex gap-4 p-6 bg-amber-50 rounded-[32px] border border-amber-100/50">
                <Scale className="text-amber-600 flex-shrink-0" size={24} />
                <div className="text-sm text-amber-900 leading-relaxed">
                  <p className="font-black uppercase tracking-widest text-[10px] mb-2">Legal Compliance Verification</p>
                  <p className="font-medium">You are accessing a secure medical environment. All actions are audited. By proceeding, you confirm your organization's active BAA and your authorization to handle PHI.</p>
                </div>
              </div>

              <div className="space-y-2">
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
              </div>

              <button 
                disabled={!agreed}
                onClick={() => setStep(2)}
                className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl disabled:opacity-30 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
              >
                Proceed to Identity Selection <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Select Your Identity</h3>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{users.length} Registered Users</span>
              </div>
              
              <div className="grid gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`flex items-center gap-4 p-5 rounded-[24px] border text-left transition-all ${
                      selectedUserId === user.id 
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/10' 
                      : 'border-slate-100 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm ${
                      selectedUserId === user.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-900">{user.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                         <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${getRoleColor(user.role)}`}>
                            {getRoleIcon(user.role)} {user.role}
                         </div>
                         <span className="text-[10px] text-slate-400 font-medium">{user.username}</span>
                      </div>
                    </div>
                    {selectedUserId === user.id && (
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                        <UserCheck size={16} />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setStep(1)}
                  className="px-6 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all text-xs uppercase"
                >
                  Back
                </button>
                <button 
                  disabled={!selectedUserId}
                  onClick={handleComplete}
                  className="flex-1 py-5 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-30"
                >
                  Confirm & Enter Workstation
                </button>
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-100 flex flex-col items-center gap-4">
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1.5 font-black uppercase tracking-widest"
            >
              HIPAA BAA Documentation <ExternalLink size={10} />
            </a>
            <p className="text-[10px] text-slate-300 font-medium">Practice Workstation V2.5 • AES-256 Active</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityGateway;
