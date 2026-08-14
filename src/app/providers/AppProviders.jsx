import ToastProvider from "../../components/feedback/ToastProvider.jsx";

export default function AppProviders({ children }) {
  return <ToastProvider>{children}</ToastProvider>;
}
