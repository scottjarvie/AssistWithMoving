import { redirect } from "next/navigation";

export default function AppIndexRedirect() {
  redirect("/app/dashboard");
}
