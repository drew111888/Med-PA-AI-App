
import { User, UserRole } from "../types.ts";

const USERS_KEY = 'medauth_user_registry';
const SESSION_KEY = 'medauth_session';
const BAA_KEY = 'medauth_baa_agreement';

// Pre-seeded accounts for the first run
const DEFAULT_USERS: User[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: 'password123',
    name: 'Practice Administrator',
    role: 'ADMIN',
    email: 'admin@practice.com',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_clinical',
    username: 'drbashir',
    password: 'password123',
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
  
  // Check for existing username
  if (users.some(u => u.username === user.username)) {
    throw new Error("Username already exists in the registry.");
  }

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
  
  const current = getCurrentUser();
  if (current?.id === id) {
    logout();
  }
};

export const getCurrentUser = (): User | null => {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  const user = JSON.parse(session);
  // Remove password from memory session for security
  delete user.password;
  return user;
};

export const authenticate = (username: string, password: string): User | null => {
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  
  if (user) {
    // Session storage doesn't need the password
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
