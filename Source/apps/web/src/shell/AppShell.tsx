import { ROLE_LABELS, type AuthMe, type Role } from '@vente-web/shared';
import { useState, type ReactNode } from 'react';

import { AccountsPanel } from '../admin/AccountsPanel.js';
import { SalesDiscountPanel } from '../admin/SalesDiscountPanel.js';
import { StationsPanel } from '../admin/StationsPanel.js';
import { errorMessage } from '../api/error-message.js';
import { useAuth } from '../auth/context.js';
import { switchableRoles } from '../auth/roles.js';
import { useIdleLock } from '../auth/useIdleLock.js';
import { DeliveryWorkspace } from '../delivery/DeliveryWorkspace.js';
import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { AuditLogPanel } from '../manager/AuditLogPanel.js';
import { CustomersPanel } from '../manager/CustomersPanel.js';
import { DeliveryIssuesPanel } from '../manager/DeliveryIssuesPanel.js';
import { ExportsPanel } from '../manager/ExportsPanel.js';
import { RegisterSessionsPanel } from '../manager/RegisterSessionsPanel.js';
import { ImportsPanel } from '../manager/ImportsPanel.js';
import { ProductsPanel } from '../manager/ProductsPanel.js';
import { StockPanel } from '../manager/StockPanel.js';
import { SupervisionWorkspace } from '../manager/SupervisionWorkspace.js';
import { CreditConditionsPanel } from '../owner/CreditConditionsPanel.js';
import { DiscountCapsPanel } from '../owner/DiscountCapsPanel.js';
import { ReservationDaysPanel } from '../owner/ReservationDaysPanel.js';
import { DiscountCodesPanel } from '../owner/DiscountCodesPanel.js';
import { DiscountRulesPanel } from '../owner/DiscountRulesPanel.js';
import { PromotionsPanel } from '../owner/PromotionsPanel.js';
import { DiscountRequestsPanel } from '../owner/DiscountRequestsPanel.js';
import { Dashboard } from '../owner/Dashboard.js';
import { ReceivablesPanel } from '../register/ReceivablesPanel.js';
import { RegisterWorkspace } from '../register/RegisterWorkspace.js';
import { SalesWorkspace } from '../sales/SalesWorkspace.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Frame } from './Frame.js';
import { useStatusLine } from './status-line.js';
import { StatusLineProvider } from './StatusLineProvider.js';

interface AppShellProps {
  me: AuthMe;
  /** Stands in for the workspace (the design gallery shows it with demo lines). */
  children?: ReactNode;
  /** The realtime channel (T-018); off in the design gallery, which has no server. */
  realtime?: boolean;
}

/**
 * Signed-in frame: the lamba in the active role's colour, who is signed in, which role, sign out;
 * one workspace per active role. Its bottom band is the workspace's status line.
 */
export function AppShell({ me, children, realtime = true }: AppShellProps) {
  return (
    <RealtimeProvider me={me} enabled={realtime}>
      <StatusLineProvider>
        <Shell me={me}>{children}</Shell>
      </StatusLineProvider>
    </RealtimeProvider>
  );
}

function Shell({ me, children }: Omit<AppShellProps, 'realtime'>) {
  const { signOut, lock, keepAlive, switchRole } = useAuth();
  const { sayError, clear } = useStatusLine();
  const [busy, setBusy] = useState(false);
  const activeRole = me.session.activeRole;
  const roles = switchableRoles(me);

  useIdleLock(me.session.idleMinutes * 60_000, lock, keepAlive);

  const changeRole = async (role: Role) => {
    setBusy(true);
    clear();
    try {
      await switchRole(role);
    } catch (failure) {
      sayError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const controls = (
    <>
      {me.session.origin === 'REMOTE' && (
        <span className="mr-3 rounded-full bg-saffron px-3 py-0.5 text-14 font-bold text-ink">
          {labels.shell.remote}
        </span>
      )}
      <span className="flex flex-col items-end py-1 pr-4 text-right">
        <span className="font-semibold whitespace-nowrap">{me.user.fullName}</span>
        {roles.length <= 1 && (
          <span className="text-14 leading-5 text-white/80">{ROLE_LABELS[activeRole]}</span>
        )}
      </span>
      <span className="flex h-12 gap-0.5">
        {roles.length > 1 && (
          <label className="relative block h-12 w-48 bg-frame-deep text-white active:bg-frame-press">
            <span className="pointer-events-none absolute top-1 left-4 text-14 leading-5 font-medium text-white/80">
              {labels.shell.activeRole}
            </span>
            <select
              value={activeRole}
              disabled={busy}
              onChange={(event) => void changeRole(event.target.value as Role)}
              className="focus-frame absolute inset-0 appearance-none bg-transparent pt-5 pr-10 pl-4 text-16 leading-5 font-bold text-white disabled:opacity-70"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <Icon
              name="chevron"
              className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className={buttonClass('band', 'md', 'h-12')}
        >
          <Icon name="signOut" className="size-5" />
          {labels.shell.signOut}
        </button>
      </span>
    </>
  );

  return (
    <Frame workspace={activeRole} name={labels.workspaces[activeRole].title} controls={controls}>
      {children ?? <Workspace role={activeRole} userId={me.user.id} />}
    </Frame>
  );
}

function Workspace({ role, userId }: { role: Role; userId: string }) {
  if (role === 'sales') return <SalesWorkspace />;
  if (role === 'cashier') {
    return (
      <>
        <RegisterWorkspace userId={userId} />
        {/* H67: what the customers owe, settled at the register with a receipt. */}
        <ReceivablesPanel canSettle />
        {/* RG-EXP-03: the cashier exports their own closings. */}
        <ExportsPanel role="cashier" />
      </>
    );
  }
  if (role === 'warehouse') return <DeliveryWorkspace userId={userId} />;
  if (role === 'manager') {
    return (
      <div className="flex flex-col pb-8">
        <SupervisionWorkspace />
        {/* RG-DSH-06: the owner's dashboard, the queues and the stock being shown above. */}
        <Dashboard live={false} />
        {/* RG-DSH-05 (H54): the requests to the owner and the answers, read-only. */}
        <DiscountRequestsPanel editable={false} />
        {/* RG-LIV-04 (H37): the manager decides on each delivery issue. */}
        <DeliveryIssuesPanel />
        {/* RG-CAI-04/05: the day's registers. */}
        <RegisterSessionsPanel />
        {/* H67: the manager follows the receivables and takes their payments (H32). */}
        <ReceivablesPanel canSettle />
        {/* RG-STK-05 à 07: the products under their threshold, adjustments with a reason. */}
        <StockPanel />
        {/* RG-ART-01 à 07 (H65): products, sale units and dated prices. */}
        <ProductsPanel />
        {/* RG-IMP-01 à 08: the catalog from Excel; the inventory is the manager's alone. */}
        <ImportsPanel canStocktake />
        {/* RG-REM-01 (H15): the caps the owner set, read-only. */}
        <DiscountCapsPanel editable={false} />
        {/* H62: the owner's discount rules, read-only. */}
        <DiscountRulesPanel editable={false} />
        {/* RG-DEV-04 (H49 a): the manager classes the customers. */}
        <CustomersPanel />
        {/* RG-EXP-01 à 03: the Excel exports the role may take. */}
        <ExportsPanel role={role} />
        {/* RG-AUD-01: who did what, read only. */}
        <AuditLogPanel />
      </div>
    );
  }
  if (role === 'admin') {
    return (
      <div className="flex flex-col pb-8">
        <header className="mx-auto mt-8 w-full max-w-4xl px-4">
          <h1 className="type-title">{labels.workspaces.admin.title}</h1>
        </header>
        {/* Annexe B, RG-USR-06: the admin manages the accounts, never deletes one. */}
        <AccountsPanel />
        {/* RG-IMP-08: the admin imports the catalog too, never an inventory. */}
        <ImportsPanel canStocktake={false} />
        {/* RG-USR-09 (H71): the shop’s stations and the pairing of its devices. */}
        <StationsPanel />
        {/* RG-STK-02 (H45): how long a validated order keeps its goods. */}
        <ReservationDaysPanel />
        {/* H60: whether the salesperson discounts at all. */}
        <SalesDiscountPanel />
        {/* RG-EXP-01 à 03: the Excel exports the role may take. */}
        <ExportsPanel role={role} />
        {/* RG-AUD-01: who did what, read only. */}
        <AuditLogPanel />
      </div>
    );
  }
  // The owner: the requests first, then the dashboard and the settings only the owner sets.
  return (
    <div className="flex flex-col pb-8">
      <header className="mx-auto mt-8 w-full max-w-4xl px-4">
        <h1 className="type-title">{labels.workspaces.owner.title}</h1>
      </header>
      {/* RG-REM-03, RG-DSH-05 (H53): the owner answers the discount requests, first of all. */}
      <DiscountRequestsPanel editable />
      {/* RG-DSH-01 à 04: the period's figures, the live queues, the products under threshold. */}
      <Dashboard live />
      {/* RG-CAI-04/05: the day's registers. */}
      <RegisterSessionsPanel />
      {/* RG-ART-01 à 07 (H65): products, sale units and dated prices. */}
      <ProductsPanel />
      {/* RG-REM-01 (H15): the owner sets the discount caps. */}
      <DiscountCapsPanel editable />
      {/* H62: the owner's discount rules, which the register applies beyond the caps. */}
      <DiscountRulesPanel editable />
      {/* H67: the owner sets the credit conditions and follows what is owed. */}
      <CreditConditionsPanel />
      <ReceivablesPanel canSettle={false} />
      {/* RG-REM-04 (H41): the owner issues and revokes the discount codes. */}
      <DiscountCodesPanel />
      {/* RG-STK-02 (H45): how long a validated order keeps its goods. */}
      <ReservationDaysPanel />
      {/* RG-DEV-06 §6 (H46, H49 b): the owner marks the products to propose. */}
      <PromotionsPanel />
      {/* RG-EXP-01 à 03: every Excel export. */}
      <ExportsPanel role="owner" />
      {/* RG-AUD-01: who did what, read only. */}
      <AuditLogPanel />
    </div>
  );
}
