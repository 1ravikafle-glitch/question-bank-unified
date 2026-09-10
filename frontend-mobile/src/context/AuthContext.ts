import { createContext } from 'react';

export interface AuthContextValue {
  userId: string;
  password: string;
  setUserId: (id: string) => void;
  setPassword: (pw: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  userId: '',
  password: '',
  setUserId: () => {},
  setPassword: () => {},
  logout: () => {},
});
