
import { User, UserRole } from "../types.ts";

const USERS_KEY = 'medauth_user_registry';
const SESSION_KEY = 'medauth_session';
const BAA_KEY = 'medauth_baa_agreement';

const DEFAULT_USERS: User[] = [
  {
    id: 'usr_admin',
    name: 'Practice Administrator',
    role: 'ADMIN',
    email: 'admin@practice.com',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_clinical',
    name: 'Dr. Julian Bashir',
    role: 'CLINICAL',
    npi: '1234567890',
    email: 'j.bashir@practice.com',
    createdAt: new Date().toISOString()
  }
];

export const getUsers = (): User[] => {
  const stored = localStorage.getItem(USERS_KEY);
  if (!stored) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  return JSON.parse(stored);
};

export const addUser = (user: Omit<User, 'id' | 'createdAt'>): User => {
  const users = getUsers();
  const newUser: User = {
    ...user,
    id: `usr_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return newUser;
};

export const deleteUser = (id: string) => {
  const users = getUsers().filter(u => u.id !== id);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  
  // If the current user deletes themselves, log them out
  const current = getCurrentUser();
  if (current?.id === id) {
    logout();
  }
};

export const getCurrentUser = (): User | null => {
  const session = localStorage.getItem(SESSION_KEY);
  return session ? JSON.parse(session) : null;
};

export const login = (userId: string): User | null => {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
  }
  return null;
};

export const logout = () => {
  localStorage.removeItem(SESSION_KEY);
};

export const isAgreementSigned = (): boolean => {
  return localStorage.getItem(BAA_KEY) === 'true';
};

export const signAgreement = () => {
  localStorage.setItem(BAA_KEY, 'true');
};
