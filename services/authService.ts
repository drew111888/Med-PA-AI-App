
import { User, UserRole } from "../types.ts";
import { storage } from "./storageService.ts";

const USERS_KEY = 'medauth_user_registry';
const SESSION_KEY = 'medauth_session';
const BAA_KEY = 'medauth_baa_agreement';

const DEFAULT_USERS: User[] = [
  {
    id: 'usr_admin_orig',
    username: 'admin',
    password: 'admin123',
    name: 'Practice Administrator',
    role: 'ADMIN',
    email: 'admin@practice.com',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_admin_123',
    username: 'admin123',
    password: 'admin123',
    name: 'System Admin (123)',
    role: 'ADMIN',
    email: 'admin123@practice.com',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_alavear',
    username: 'alavear',
    password: 'admin123',
    name: 'A. Lavear',
    role: 'ADMIN',
    email: 'alavear@practice.com',
    createdAt: new Date().toISOString()
  }
];

export const getUsers = async (): Promise<User[]> => {
  const stored = await storage.get<User[]>(USERS_KEY, DEFAULT_USERS);
  
  // MERGE LOGIC: Ensure requested credentials always exist even if storage has old data
  const merged = [...stored];
  DEFAULT_USERS.forEach(defUser => {
    if (!merged.some(u => u.username.toLowerCase() === defUser.username.toLowerCase())) {
      merged.push(defUser);
    }
  });
  
  if (merged.length !== stored.length) {
    await storage.set(USERS_KEY, merged);
  }
  
  return merged;
};

export const addUser = async (user: Omit<User, 'id' | 'createdAt'>): Promise<User> => {
  const users = await getUsers();
  
  if (users.some(u => u.username.toLowerCase() === user.username.toLowerCase())) {
    throw new Error("Username already exists in the registry.");
  }

  const newUser: User = {
    ...user,
    id: `usr_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  await storage.set(USERS_KEY, users);
  return newUser;
};

export const deleteUser = async (id: string) => {
  const users = (await getUsers()).filter(u => u.id !== id);
  await storage.set(USERS_KEY, users);
  
  const current = getCurrentUser();
  if (current?.id === id) {
    logout();
  }
};

export const getCurrentUser = (): User | null => {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  const user = JSON.parse(session);
  delete user.password;
  return user;
};

export const authenticate = async (username: string, password: string): Promise<User | null> => {
  const users = await getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  
  if (user) {
    const sessionUser = { ...user };
    delete sessionUser.password;
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    return sessionUser;
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
