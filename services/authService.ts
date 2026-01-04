
import { User, UserRole } from "../types.ts";
import { storage } from "./storageService.ts";

const USERS_KEY = 'medauth_user_registry';
const SESSION_KEY = 'medauth_session';
const BAA_KEY = 'medauth_baa_agreement';

const DEFAULT_USERS: User[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: 'admin123',
    name: 'Practice Administrator',
    role: 'ADMIN',
    email: 'admin@practice.com',
    createdAt: new Date().toISOString()
  }
];

export const getUsers = async (): Promise<User[]> => {
  return await storage.get<User[]>(USERS_KEY, DEFAULT_USERS);
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
