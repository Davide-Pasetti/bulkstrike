// app/login/page.jsx
// Route di compatibilità: diverse pagine (Carrello, Checkout, ecc.) puntano il
// bottone "Accedi" a /login, ma la pagina di login reale è /auth/login.
// Invece di correggere ogni singolo componente, questa route fa da redirect
// permanente — così qualsiasi link a /login, presente o futuro, funziona.
import { redirect } from "next/navigation";

export default function LoginRedirect() {
  redirect("/auth/login");
}
