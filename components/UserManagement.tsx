
import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Edit2, Shield, UserCircle, Fingerprint, X, Check, Save } from 'lucide-react';
import { User } from '../types.ts';
import { getAllUsers, saveUser, deleteUser, provisionUser } from '../services/userService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [newUserForm, setNewUserForm] = useState<Partial<User>>({
    name: '',
    username: '',
    email: '',
    role: 'PROVIDER'
  });

  const currentUser = getCurrentUser();

  useEffect(() => {
    setUsers(getAllUsers());
  }, []);

  const handleProvision = () => {
    if (newUserForm.name && newUserForm.email) {
      const user = provisionUser(newUserForm);
      setUsers(getAllUsers());
      setIsAdding(false);
      setNewUserForm({ name: '', username: '', email: '', role: 'PROVIDER' });
      if (currentUser) logAction(currentUser, `Provisioned new user: ${user.name}`, 'LOGIN', `Role: ${user.role}`);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (id === currentUser?.id) {
      alert("You cannot delete your own administrative account.");
      return;
    }
    if (window.confirm(`Are you sure you want to permanently revoke access for ${name}?`)) {
      deleteUser(id);
      setUsers(getAllUsers());
      if (currentUser) logAction(currentUser, `Deleted user account: ${name}`, 'LOGIN', `ID: ${id}`);
    }
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm(user);
  };

  const handleUpdate = () => {
    if (editForm.id) {
      saveUser(editForm as User);
      setUsers(getAllUsers());
      setEditingId(null);
      if (currentUser) logAction(currentUser, `Updated user permissions: ${editForm.name}`, 'LOGIN', `New Role: ${editForm.role}`);
    }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User & Access Control</h2>
          <p className="text-slate-500">Manage organizational accounts and clinical permissions.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
        >
          <UserPlus size={20} /> Provision User
        </button>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Member</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Username</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Clinical Role</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Access Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((user) => (
              <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 text-sm">
                      {getInitials(user.name)}
                    </div>
                    <div>
                      {editingId === user.id ? (
                        <input 
                          value={editForm.name} 
                          onChange={e => setEditForm({...editForm, name: e.target.value})}
                          className="font-bold text-slate-900 border-b border-blue-500 outline-none"
                        />
                      ) : (
                        <p className="font-bold text-slate-900">{user.name}</p>
                      )}
                      {editingId === user.id ? (
                        <input 
                          value={editForm.email} 
                          onChange={e => setEditForm({...editForm, email: e.target.value})}
                          className="text-xs text-slate-400 block border-b border-blue-500 outline-none mt-1"
                        />
                      ) : (
                        <p className="text-xs text-slate-400">{user.email}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 font-mono">
                    <Fingerprint size={14} className="opacity-30" />
                    {user.username}
                  </div>
                </td>
                <td className="px-8 py-6">
                  {editingId === user.id ? (
                    <select 
                      value={editForm.role}
                      onChange={e => setEditForm({...editForm, role: e.target.value as any})}
                      className="text-[10px] font-black uppercase tracking-wider bg-white border border-blue-200 rounded-lg px-2 py-1 outline-none"
                    >
                      <option value="ADMIN">Practice Admin</option>
                      <option value="PROVIDER">Medical Provider</option>
                      <option value="BILLER">Billing / Admin</option>
                    </select>
                  ) : (
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg ${
                      user.role === 'ADMIN' ? 'bg-purple-50 text-purple-600' : 
                      user.role === 'PROVIDER' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {user.role === 'ADMIN' ? 'Practice Admin' : user.role === 'PROVIDER' ? 'Medical Provider' : 'Billing / Admin'}
                    </span>
                  )}
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingId === user.id ? (
                      <>
                        <button onClick={handleUpdate} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Save Changes">
                          <Check size={18} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg" title="Cancel">
                          <X size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(user)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit Member">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(user.id, user.name)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Revoke Access">
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Provisioning Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-blue-600 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">Provision New User</h3>
                <p className="text-blue-100 text-xs">Establish secure clinical credentials.</p>
              </div>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-10 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Legal Name</label>
                  <input 
                    type="text" 
                    value={newUserForm.name}
                    onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                    placeholder="e.g. Dr. Jordan Smith"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Work Email Address</label>
                  <input 
                    type="email" 
                    value={newUserForm.email}
                    onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                    placeholder="j.smith@yourpractice.com"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Username</label>
                  <input 
                    type="text" 
                    value={newUserForm.username}
                    onChange={e => setNewUserForm({...newUserForm, username: e.target.value})}
                    placeholder="jsmith"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">System Access Role</label>
                  <div className="grid grid-cols-1 gap-2">
                    {['ADMIN', 'PROVIDER', 'BILLER'].map(role => (
                      <button 
                        key={role}
                        onClick={() => setNewUserForm({...newUserForm, role: role as any})}
                        className={`px-4 py-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                          newUserForm.role === role ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <span className="text-sm font-bold text-slate-700">{role === 'ADMIN' ? 'Practice Admin' : role === 'PROVIDER' ? 'Medical Provider' : 'Billing / Admin'}</span>
                        {newUserForm.role === role && <Check size={16} className="text-blue-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={handleProvision}
                className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-widest text-xs rounded-3xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
              >
                Provision Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
