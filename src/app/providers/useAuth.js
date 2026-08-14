import { useContext } from "react";
import { AuthContext } from "./AuthContext.js";

export function useAuth() {
  return useContext(AuthContext);
}
