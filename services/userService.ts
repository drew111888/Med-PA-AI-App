
import { User } from "../types.ts";

const STORAGE_KEY = 'medauth_users_registry';

/**
 * DEFAULT_USERS serves as a "Seed" for empty workstations.
 * Once any changes are made via the UI, the localStorage version becomes the primary database.
 * To change these permanently, use the "User Management" tab in the app.
 */
const SEED_USERS: User[] = [
  {
    id: 'seed_admin',
    name: 'Practice Administrator',
    username: 'admin',
    password: 'admin123',
    email: 'admin@practice.com',
    role: 'ADMIN'
  },
  {
    id: 'seed_alavear',
    name: 'A. Lavear',
    username: 'alavear',
    password: 'password123',
    email: 'alavear@practice.com',
    role: 'ADMIN'
  }
];

export const getAllUsers = (): User[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // First time run or cache cleared
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_USERS));
      return SEED_USERS;
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error("Critical: Failed to retrieve user registry from local database.", error);
    return SEED_USERS;
  }
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
    password: data.password || 'Temporary123!',
    email: data.email || 'user@practice.com',
    role: data.role || 'PROVIDER',
    npi: data.npi
  };
  saveUser(newUser);
  return newUser;
};
