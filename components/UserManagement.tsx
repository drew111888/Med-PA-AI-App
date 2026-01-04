
import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Shield, UserCircle, Mail, Calendar, X, Plus } from 'lucide-react';
import { User, UserRole } from '../types.ts';
import { getUsers, addUser, deleteUser } from '../services/authService.ts';
import { logAction } from '../services/auditService.ts';
import { getCurrentUser } from '../services/authService.ts';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'CLINICAL' as UserRole,
    npi: ''
  });

  const currentUser = getCurrentUser();

  useEffect(() => {
    setUsers(getUsers());
  }, []);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    const newUser = addUser(formData);
    setUsers(getUsers());
    setShowAddModal(false);
    setFormData({ name: '', email: '', role: 'CLINICAL', npi: '' });

    if (currentUser) {
      logAction(currentUser, `Added user: ${newUser.name}`, 'USER_MANAGEMENT', `Assigned role: ${newUser.role}`);
    }
  };

  const handleDeleteUser = (id: string, name: string) => {
    if (id === currentUser?.id) {
      alert("You cannot delete your own account while logged in.");
      return;
    }

    if (window.confirm(`Are you sure you want to revoke access for ${name}?`)) {
      deleteUser(id);
      setUsers(getUsers());
      if (currentUser) {
        logAction(currentUser, `Deleted user: ${name}`, 'USER_MANAGEMENT', `Removed ID: ${id}`);
      }
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': return <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-md">Administrator</span>;
      case 'CLINICAL': return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-md">Clinical Staff</span>;
      case 'ADMIN_STAFF': return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-md">Administrative Staff</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="text-slate-500">Control practice access and permission levels.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg"
        >
          <UserPlus size={18} /> Add User
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">User Details</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Added Date</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {getRoleBadge(user.role)}
                  {user.npi && <p className="text-[10px] text-slate-400 mt-1 font-mono">NPI: {user.npi}</p>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar size={12} />
                    {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => handleDeleteUser(user.id, user.name)}
                    disabled={user.id === currentUser?.id}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="text-blue-400" size={20} /> New User Access
              </h3>
              <button onClick={() => setShowAddModal(false)} className="hover:bg-white/10 p-1 rounded-full"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAddUser} className="p-8 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                <div className="relative">
                  <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Dr. John Doe"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type="email" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="name@practice.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Authorization Role</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                  >
                    <option value="CLINICAL">Clinical Staff</option>
                    <option value="ADMIN_STAFF">Administrative Staff</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              </div>

              {formData.role === 'CLINICAL' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">NPI Number (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.npi}
                    onChange={e => setFormData({...formData, npi: e.target.value})}
                    placeholder="10-digit NPI"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> Grant Access
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
