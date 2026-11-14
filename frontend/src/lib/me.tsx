"use client";

import { createContext, useContext } from "react";
import type { Me } from "./types";

// Quién entró al panel: lo carga dashboard/layout.tsx una sola vez (/auth/me)
// y cada pantalla lo lee con useMe(), sin volver a pedirlo
const MeContext = createContext<Me | null>(null);

export const MeProvider = MeContext.Provider;

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() solo funciona dentro del panel");
  return me;
}

// Misma regla que el backend (auth/membership.ts): todo lo que no es dueño
// tiene permisos limitados. Nunca comparar con 'STAFF': un rol nuevo debe
// partir limitado en vez de heredar lo del dueño
export const isOwner = (me: Me) => me.membership.role === "OWNER";
