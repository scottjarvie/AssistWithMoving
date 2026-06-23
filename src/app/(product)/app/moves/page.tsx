import { redirect } from "next/navigation";

export default function MovesIndexRedirect() {
  redirect("/app/dashboard");
}
