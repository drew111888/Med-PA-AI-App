
import { User } from "../types.ts";
import { getAllUsers } from "./userService.ts";

export const getCurrentUser = (): User | null => {
  try {
    const session = localStorage.getItem('medauth_session');
    return session ? JSON.parse(session) : null;
  } catch (e) {
    console.error("Auth session retrieval failed", e);
    return null;
  }
};

/**
 * Authenticates a user based on unique credentials
 */
export const authenticate = (username: string, password: string): User | null => {
  const users = getAllUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  
  if (user) {
    // Return user without password for session storage
    const { password, ...safeUser } = user;
    localStorage.setItem('medauth_session', JSON.stringify(safeUser));
    return safeUser as User;
  }
  
  return null;
};

export const logout = () => {
  localStorage.removeItem('medauth_session');
};

export const isAgreementSigned = (): boolean => {
  return localStorage.getItem('medauth_baa_agreement') === 'true';
};

export const signAgreement = () => {
  localStorage.setItem('medauth_baa_agreement', 'true');
};
