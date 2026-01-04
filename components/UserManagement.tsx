
import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Shield, UserCircle, Mail, Calendar, X, Plus, Key, Lock, Fingerprint, AlertCircle } from 'lucide-react';
import { User, UserRole } from '../types.ts';
import { getUsers, addUser, deleteUser } from '../services/authService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    email: '',
    role: 'CLINICAL' as UserRole,
    npi: ''
  });
  const [error, setError] = useState<string | null>(null);

  const currentUser = getCurrentUser();

  useEffect(() => {
    setUsers(getUsers());
  }, []);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name || !formData.username || !formData.password) {
      setError("Please fill in all required clinical access fields.");
      return;
    }

    try {
      const newUser = addUser(formData);
      setUsers(getUsers());
      setShowAddModal(false);
      setFormData({ name: '', username: '', password: '', email: '', role: 'CLINICAL', npi: '' });

      if (currentUser) {
        logAction(currentUser, `Provisioned new user: ${newUser.name}`, 'USER_MANAGEMENT', `Role: ${newUser.role} | Username: ${newUser.username}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to add user.");
    }
  };

  const handleDeleteUser = (id: string, name: string) => {
    if (id === currentUser?.id) {
      alert("Self-deletion of active administrator sessions is disabled for security.");
      return;
    }

    if (window.confirm(`REVOKE ACCESS: Are you sure you want to permanently remove system access for ${name}?`)) {
      deleteUser(id);
      setUsers(getUsers());
      if (currentUser) {
        logAction(currentUser, `Revoked access: ${name}`, 'USER_MANAGEMENT', `User ID ${id} purged from registry`);
      }
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': return 'Practice Administrator';
      case 'CLINICAL': return 'Clinical Staff';
      case 'ADMIN_STAFF': return 'Administrative Staff';
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': return <span className="px-3 py-1 bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-purple-200">Practice Admin</span>;
      case 'CLINICAL': return <span className="px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-blue-200">Clinical Staff</span>;
      case 'ADMIN_STAFF': return <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-emerald-200">Admin Staff</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User & Access Control</h2>
          <p className="text-slate-500">Manage organizational accounts and clinical permissions.</p>
        </div>
        <button 
          onClick={() => { setError(null); setShowAddModal(true); }}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 active:scale-95"
        >
          <UserPlus size={20} /> Provision User
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Member</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Username</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Clinical Role</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Access Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-8 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500 font-black text-lg shadow-sm border border-white">
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                      <p className="text-xs text-slate-400 font-medium">{user.email || 'No email provided'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2 text-sm font-mono text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 w-fit">
                    <Fingerprint size={14} className="text-slate-400" /> {user.username}
                  </div>
                </td>
                <td className="px-8 py-5">
                  {getRoleBadge(user.role)}
                  {user.npi && <p className="text-[10px] text-slate-400 mt-2 font-mono">NPI: {user.npi}</p>}
                </td>
                <td className="px-8 py-5 text-right">
                  <button 
                    onClick={() => handleDeleteUser(user.id, user.name)}
                    disabled={user.id === currentUser?.id}
                    className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all disabled:opacity-0"
                    title="Revoke System Access"
                  >
                    <Trash2 size={20} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
              <div className="relative z-10">
                <h3 className="text-2xl font-bold flex items-center gap-3">
                  <UserPlus className="text-blue-400" size={24} /> Provision New Account
                </h3>
                <p className="text-slate-400 text-sm mt-1">Authorized Practice Personnel Only</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors relative z-10"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleAddUser} className="p-10 space-y-6">
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-sm font-bold flex items-center gap-2">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Legal Name</label>
                  <div className="relative group">
                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Full Name" className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="office@practice.com" className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Unique Username</label>
                  <div className="relative group">
                    <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input required type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="Username" className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Initial Password</label>
                  <div className="relative group">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input required type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Set Password" className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                 <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Practice Role</label>
                  <div className="relative group">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <select 
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none"
                    >
                      <option value="CLINICAL">Clinical Staff</option>
                      <option value="ADMIN_STAFF">Administrative Staff</option>
                      <option value="ADMIN">Practice Administrator</option>
                    </select>
                  </div>
                </div>
                {formData.role === 'CLINICAL' && (
                  <div className="animate-in slide-in-from-bottom-2 duration-300">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">NPI Number</label>
                    <input type="text" value={formData.npi} onChange={e => setFormData({...formData, npi: e.target.value})} placeholder="10-digit NPI" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all" />
                  </div>
                )}
              </div>

              <div className="pt-6">
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <Plus size={20} /> Grant Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
