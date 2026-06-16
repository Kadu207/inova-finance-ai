"use client";

import { useRouter } from "next/navigation";
import { clearSession } from "@/lib/auth.client";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="ina-btn ina-btn--ghost"
      style={{ fontSize: "0.8125rem" }}
      onClick={() => {
        clearSession();
        router.push("/login");
      }}
    >
      Sair
    </button>
  );
}
