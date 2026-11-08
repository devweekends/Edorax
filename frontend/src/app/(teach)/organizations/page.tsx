import type { InstructorOrganizationsView } from "@/shared/api/teach";
import { serverApiFetch } from "@/lib/api-server";
import { OrganizationsManager } from "@/components/teach/organizations/organizations-manager";

export const metadata = {
  title: "Organizations | Teach Workspace",
};

export default async function InstructorOrganizationsPage() {
  const data = await serverApiFetch<InstructorOrganizationsView>("/api/v1/teach/organizations");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Organizations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage organization access and review requests for your courses.
        </p>
      </div>
      <OrganizationsManager {...data} />
    </div>
  );
}
