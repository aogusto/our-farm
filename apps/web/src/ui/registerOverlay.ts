import { HAND_SHAPES, DEFAULT_HAND_STYLE } from "@our-farm/shared";
import type { HandStyle } from "@our-farm/shared";
import { registerUser, type RegisterResult } from "../api";

const SHAPE_LABELS: Record<string, string> = {
  point: "Apontando",
  open: "Aberta",
  pinch: "Pinça",
};

/**
 * Mostra o formulário de cadastro e resolve com o token quando o usuário
 * registra um apelido + mãozinha. Remove o overlay do DOM ao concluir.
 */
export function showRegisterOverlay(): Promise<RegisterResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <form class="overlay__card">
        <h1>Bem-vindo à Our Farm</h1>
        <label>Apelido
          <input name="nickname" maxlength="20" autocomplete="off" required />
        </label>
        <label>Cor da mãozinha
          <input name="color" type="color" value="${DEFAULT_HAND_STYLE.color}" />
        </label>
        <label>Estilo da mãozinha
          <select name="shape">
            ${HAND_SHAPES.map(
              (s) => `<option value="${s}">${SHAPE_LABELS[s] ?? s}</option>`,
            ).join("")}
          </select>
        </label>
        <div class="overlay__error"></div>
        <button type="submit">Entrar na fazenda</button>
      </form>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("form") as HTMLFormElement;
    const errorEl = overlay.querySelector(".overlay__error") as HTMLDivElement;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const nickname = String(data.get("nickname") ?? "").trim();
      if (!nickname) {
        errorEl.textContent = "Escolha um apelido.";
        return;
      }
      const handStyle: HandStyle = {
        color: String(data.get("color") ?? DEFAULT_HAND_STYLE.color),
        shape: String(data.get("shape") ?? DEFAULT_HAND_STYLE.shape) as HandStyle["shape"],
      };
      errorEl.textContent = "";
      try {
        const result = await registerUser(nickname, handStyle);
        overlay.remove();
        resolve(result);
      } catch {
        errorEl.textContent = "Não foi possível registrar. O servidor está rodando?";
      }
    });
  });
}
