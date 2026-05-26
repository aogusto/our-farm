import { fetchMe } from "./api";
import { showRegisterOverlay } from "./ui/registerOverlay";
import type { User } from "@our-farm/shared";

const TOKEN_KEY = "our-farm:token";

/**
 * Garante uma identidade válida: reaproveita o token do localStorage se ainda
 * for válido; senão mostra o overlay de cadastro. Resolve com o token e o User.
 */
export async function ensureIdentity(): Promise<{ token: string; user: User }> {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    const user = await fetchMe(stored);
    if (user) return { token: stored, user };
    localStorage.removeItem(TOKEN_KEY);
  }

  const registered = await showRegisterOverlay();
  localStorage.setItem(TOKEN_KEY, registered.token);
  const user = await fetchMe(registered.token);
  if (!user) throw new Error("registro concluído mas /api/me falhou");
  return { token: registered.token, user };
}
