'use client';

import {
  CheckCircle2,
  Mail,
  Settings2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

export function EmailConfig() {
  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Email"
        description="Connect and manage the shared company mailbox."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="size-5 text-primary" />
              </div>

              <div>
                <CardTitle>
                  Microsoft 365 mailbox
                </CardTitle>

                <CardDescription className="mt-1">
                  Connect the company mailbox so authorized CRM users can
                  read and respond to emails from the same inbox.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-muted-foreground" />

                <p className="text-sm font-medium text-foreground">
                  Not connected
                </p>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                No Microsoft 365 mailbox has been connected to this account.
              </p>
            </div>

            <Button type="button" disabled>
              <Mail className="size-4" />
              Connect Microsoft 365
            </Button>

            <p className="text-xs text-muted-foreground">
              The Microsoft connection will be enabled in the next development
              step.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Planned features
              </CardTitle>

              <CardDescription>
                Features that will be available in the shared Email Inbox.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {[
                'Shared company mailbox',
                'Inbox and sent emails',
                'Reply and forward',
                'Email templates',
                'Professional signatures',
                'Attachments',
                'Simultaneous access',
              ].map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  {feature}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="size-4" />
                Initial scope
              </CardTitle>
            </CardHeader>

            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This first version will not create leads, contacts or pipeline
                opportunities automatically.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}