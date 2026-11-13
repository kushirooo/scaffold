import { Suspense } from "react";
import "../us19.css";
import { ResetPasswordPage } from "@/components/us19-password-recovery";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage />
    </Suspense>
  );
}
