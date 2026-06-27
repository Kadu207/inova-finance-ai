"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth.client";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="ina-btn ina-btn--ghost"
      style={{ fontSize: "0.8125rem" }}
      onClick={async () => {
        await logout();
        router.push("/login");
      }}
    >
      Sair
    </button>
  );
}
