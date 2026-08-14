import { useContext } from "react";
import { ToastContext } from "./ToastContext.js";

export function useToast() {
  return useContext(ToastContext);
}
