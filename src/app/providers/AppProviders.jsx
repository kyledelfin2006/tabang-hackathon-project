import ToastProvider from "../../components/feedback/ToastProvider.jsx";
import AuthProvider from "./AuthProvider.jsx";

export default function AppProviders({ children, authGateway }) {
  return (
    <AuthProvider gateway={authGateway}>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
