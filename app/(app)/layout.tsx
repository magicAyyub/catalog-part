import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Everything under this group requires a live session, checked against the
 * database rather than against the cookie signature alone. A page added here
 * is protected by where it sits, not by anyone remembering to guard it.
 *
 * `/login` lives outside the group, which is what keeps this redirect from
 * looping.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    if (!(await getCurrentUser())) redirect("/login");
    return <>{children}</>;
}
