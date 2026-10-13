import { redirect } from "next/navigation";

// There is no Overview page any more: the Bank Account page is the home page.
export default function HomePage() {
  redirect("/account");
}
