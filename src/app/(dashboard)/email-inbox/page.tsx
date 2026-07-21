import Link from 'next/link';
import {
  Archive,
  FileText,
  Inbox,
  Mail,
  Search,
  Send,
  Settings,
} from 'lucide-react';

const folders = [
  {
    name: 'Inbox',
    icon: Inbox,
    count: 0,
    active: true,
  },
  {
    name: 'Sent',
    icon: Send,
    count: 0,
    active: false,
  },
  {
    name: 'Drafts',
    icon: FileText,
    count: 0,
    active: false,
  },
  {
    name: 'Archived',
    icon: Archive,
    count: 0,
    active: false,
  },
];

export default function EmailInboxPage() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="size-6 text-primary" />

            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Email Inbox
            </h1>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            View and manage your company email from the CRM.
          </p>
        </div>

        <Link
          href="/settings"
          className="
            inline-flex h-9 items-center justify-center gap-2
            rounded-md border border-border
            bg-background px-4
            text-sm font-medium text-foreground
            transition-colors
            hover:bg-muted
          "
        >
          <Settings className="size-4" />
          Email Settings
        </Link>
      </div>

      {/* Inbox layout */}
      <div
        className="
          grid min-h-[650px] flex-1 overflow-hidden
          rounded-xl border border-border bg-card
          lg:grid-cols-[210px_340px_minmax(0,1fr)]
        "
      >
        {/* Folders */}
        <aside className="border-b border-border p-3 lg:border-r lg:border-b-0">
          <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Mailbox
          </p>

          <nav className="space-y-1">
            {folders.map((folder) => {
              const Icon = folder.icon;

              return (
                <button
                  key={folder.name}
                  type="button"
                  className={`
                    flex w-full items-center gap-3
                    rounded-lg px-3 py-2
                    text-left text-sm font-medium
                    transition-colors
                    ${
                      folder.active
                        ? 'bg-primary-soft text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }
                  `}
                >
                  <Icon className="size-4 shrink-0" />

                  <span className="flex-1">
                    {folder.name}
                  </span>

                  {folder.count > 0 && (
                    <span className="text-xs">
                      {folder.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 rounded-lg border border-dashed border-border p-3">
            <p className="text-sm font-medium text-foreground">
              Mailbox not connected
            </p>

            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Connect the company Microsoft 365 mailbox from Settings.
            </p>
          </div>
        </aside>

        {/* Message list */}
        <section className="border-b border-border lg:border-r lg:border-b-0">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search
                className="
                  pointer-events-none
                  absolute top-1/2 left-3
                  size-4 -translate-y-1/2
                  text-muted-foreground
                "
              />

              <input
                type="search"
                placeholder="Search emails..."
                disabled
                className="
                  h-9 w-full rounded-md
                  border border-border
                  bg-muted/50
                  pr-3 pl-9
                  text-sm text-foreground
                  outline-none
                  placeholder:text-muted-foreground
                  disabled:cursor-not-allowed
                  disabled:opacity-70
                "
              />
            </div>
          </div>

          <div className="flex min-h-[400px] items-center justify-center p-6">
            <div className="max-w-[260px] text-center">
              <div
                className="
                  mx-auto flex size-12
                  items-center justify-center
                  rounded-full bg-primary-soft
                "
              >
                <Inbox className="size-5 text-primary" />
              </div>

              <h2 className="mt-4 text-sm font-semibold text-foreground">
                No emails yet
              </h2>

              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Emails will appear here after connecting the company mailbox.
              </p>
            </div>
          </div>
        </section>

        {/* Selected email */}
        <section className="hidden min-w-0 lg:flex lg:items-center lg:justify-center">
          <div className="max-w-sm px-8 text-center">
            <div
              className="
                mx-auto flex size-14
                items-center justify-center
                rounded-full border border-border
                bg-muted/40
              "
            >
              <Mail className="size-6 text-muted-foreground" />
            </div>

            <h2 className="mt-4 text-base font-semibold text-foreground">
              Select an email
            </h2>

            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Choose a message from the inbox to read, reply, forward or view
              its attachments.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}