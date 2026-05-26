import { SERVER_HTTP } from "./config";
import type { HandStyle, User } from "@our-farm/shared";

export interface RegisterResult {
  userId: string;
  token: string;
}

export async function registerUser(nickname: string, handStyle: HandStyle): Promise<RegisterResult> {
  const res = await fetch(`${SERVER_HTTP}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname, handStyle }),
  });
  if (!res.ok) throw new Error(`registro falhou (${res.status})`);
  return res.json() as Promise<RegisterResult>;
}

export async function fetchMe(token: string): Promise<User | null> {
  const res = await fetch(`${SERVER_HTTP}/api/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user: User };
  return body.user;
}
