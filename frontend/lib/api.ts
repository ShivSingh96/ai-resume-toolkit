export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem("resume_client_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("resume_client_id", id);
  }
  return id;
}
