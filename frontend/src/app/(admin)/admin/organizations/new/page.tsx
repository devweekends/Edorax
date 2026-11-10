import { createOrganizationAction } from "@/server/actions/admin/organizations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminBackLink, AdminPageHeader, AdminPanel } from "@/components/admin/admin-ui";

export default function NewOrganizationPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminBackLink href="/admin/organizations">← Back to organizations</AdminBackLink>

      <AdminPageHeader
        eyebrow="Tenants"
        title="New organization"
        description="A default API credential pair is created automatically. You will see the secret once after creation."
      />

      <AdminPanel className="max-w-xl">
        <AdminActionForm
          action={createOrganizationAction}
          submitLabel="Create organization"
          pendingLabel="Creating…"
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" name="name" required minLength={2} placeholder="Acme Learning" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug (optional)</Label>
            <Input id="slug" name="slug" placeholder="acme-learning" />
            <p className="text-xs text-muted-foreground">
              Used in URLs and logs; generated from the name if empty.
            </p>
          </div>
        </AdminActionForm>
      </AdminPanel>
    </div>
  );
}
