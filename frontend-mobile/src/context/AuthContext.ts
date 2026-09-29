import { createContext } from 'react';

export interface AuthContextValue {
  userId: string;
  sessionToken: string;
  setUserId: (id: string) => void;
  setSessionToken: (token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  userId: '',
  sessionToken: '',
  setUserId: () => {},
  setSessionToken: () => {},
  logout: () => {},
});
