import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Lock, ExternalLink, Scale, UserCircle, Briefcase, Settings } from 'lucide-react';
import { signAgreement, login } from '../services/authService.ts';
import { User } from '../types.ts';

interface SecurityGatewayProps {
  onAuthenticated: (user: User) => void;
}

const SecurityGateway: React.FC<SecurityGatewayProps> = ({ onAuthenticated }) => {
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<User['role']>('PROVIDER');

  const handleComplete = () => {
    signAgreement();
    const user = login(true, selectedRole);
    if (user) onAuthenticated(user);
  };

  const roles: { id: User['role'], label: string, icon: any, desc: string }[] = [
    { id: 'ADMIN', label: 'Administrator', icon: Settings, desc: 'Full system access & policy management' },
    { id: 'PROVIDER', label: 'Medical Provider', icon: UserCircle, desc: 'Clinical analysis & appeal building' },
    { id: 'BILLER', label: 'Billing / Admin', icon: Briefcase, desc: 'Appeal drafting & case history access' },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[9999]">
      <div className="bg-white max-w-xl w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 bg-blue-600 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-2xl font-bold">HIPAA Compliance Verification</h2>
          <p className="text-blue-100 mt-2 text-sm">Authorized personnel only. Please verify your identity.</p>
        </div>

        <div className="p-8 space-y-6">
          {step === 1 ? (
            <div className="space-y-4">
              <div className="flex gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <Scale className="text-amber-600 flex-shrink-0" size={24} />
                <div className="text-sm text-amber-800">
                  <p className="font-bold mb-1">Critical Notice</p>
                  <p>Processing patient information requires an active Business Associate Agreement (BAA) and specific role authorization.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={agreed} 
                    onChange={e => setAgreed(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded text-blue-600"
                  />
                  <div className="text-sm text-slate-700 font-medium">
                    I verify that my organization has a BAA in place and I am authorized for HIPAA-compliant data processing.
                  </div>
                </label>
              </div>

              <button 
                disabled={!agreed}
                onClick={() => setStep(2)}
                className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl disabled:opacity-50 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                Proceed to Role Selection <Lock size={18} />
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4">Identify your role:</h3>
                <div className="grid gap-3">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRole(role.id)}
                      className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                        selectedRole === role.id 
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600' 
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedRole === role.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <role.icon size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{role.label}</p>
                        <p className="text-xs text-slate-500">{role.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={handleComplete}
                className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg"
              >
                Enter Secure Workstation
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-center">
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
            >
              HIPAA Compliance Documentation <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityGateway;