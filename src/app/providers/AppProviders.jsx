import AuthProvider from "./AuthProvider.jsx";

export default function AppProviders({ children, authGateway }) {
  return <AuthProvider gateway={authGateway}>{children}</AuthProvider>;
}
