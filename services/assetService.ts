
import { PracticeBranding, PositionStatement } from "../types.ts";

const BRANDING_KEY = 'medauth_practice_branding';
const STATEMENTS_KEY = 'medauth_position_statements';

export const getBranding = (): PracticeBranding => {
  try {
    const stored = localStorage.getItem(BRANDING_KEY);
    return stored ? JSON.parse(stored) : {
      name: '',
      address: '',
      npi: '',
      contactEmail: ''
    };
  } catch (e) {
    console.error("Error loading branding assets", e);
    return { name: '', address: '', npi: '', contactEmail: '' };
  }
};

export const saveBranding = (branding: PracticeBranding) => {
  localStorage.setItem(BRANDING_KEY, JSON.stringify(branding));
};

export const getStatements = (): PositionStatement[] => {
  try {
    const stored = localStorage.getItem(STATEMENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Error loading position statements", e);
    return [];
  }
};

export const saveStatement = (statement: PositionStatement) => {
  const statements = getStatements();
  const index = statements.findIndex(s => s.id === statement.id);
  if (index >= 0) {
    statements[index] = statement;
  } else {
    statements.push(statement);
  }
  localStorage.setItem(STATEMENTS_KEY, JSON.stringify(statements));
};

export const deleteStatement = (id: string) => {
  const statements = getStatements();
  const filtered = statements.filter(s => s.id !== id);
  localStorage.setItem(STATEMENTS_KEY, JSON.stringify(filtered));
};
