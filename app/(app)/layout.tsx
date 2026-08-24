import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Everything under this group requires a live session, checked against the
 * database rather than against the cookie signature alone. A page added here
 * is protected by where it sits, not by anyone remembering to guard it.
 *
 * `/login` lives outside the group, which is what keeps this redirect from
 * looping, and which is why the header lives here rather than in the root
 * layout: a signed-out visitor has no reason to see it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    if (!(await getCurrentUser())) redirect("/login");
    return (
        <>
            <SiteHeader />
            {children}
        </>
    );
}
