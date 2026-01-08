
import { User } from "../types.ts";

const STORAGE_KEY = 'medauth_users_registry';

const DEFAULT_USERS: User[] = [
  {
    id: '1',
    name: 'Practice Administrator',
    username: 'admin',
    email: 'admin@practice.com',
    role: 'ADMIN'
  },
  {
    id: '2',
    name: 'System Admin (123)',
    username: 'admin123',
    email: 'admin123@practice.com',
    role: 'ADMIN'
  },
  {
    id: '3',
    name: 'A. Lavear',
    username: 'alavear',
    email: 'alavear@practice.com',
    role: 'ADMIN'
  }
];

export const getAllUsers = (): User[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  return JSON.parse(stored);
};

export const saveUser = (user: User) => {
  const users = getAllUsers();
  const index = users.findIndex(u => u.id === user.id);
  if (index >= 0) {
    users[index] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
};

export const deleteUser = (id: string) => {
  const users = getAllUsers();
  const filtered = users.filter(u => u.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const provisionUser = (data: Partial<User>): User => {
  const newUser: User = {
    id: `usr_${Math.random().toString(36).substr(2, 9)}`,
    name: data.name || 'New User',
    username: data.username || 'newuser',
    email: data.email || 'user@practice.com',
    role: data.role || 'PROVIDER',
    npi: data.npi
  };
  saveUser(newUser);
  return newUser;
};
