import { SettingsTabs } from "@/components/settings/settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, billing, and account security.</p>
      </div>
      <SettingsTabs />
      <div className="max-w-2xl">{children}</div>
    </div>
  );
}
