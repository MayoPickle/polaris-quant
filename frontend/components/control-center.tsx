"use client";

import {
  ArrowUpRight,
  CircleGauge,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { LanguageToggle } from "@/components/language-toggle";
import { MarketSessionBadge } from "@/components/market-session-badge";
import {
  CONTROL_CENTER_NAV_ITEMS,
  isNavItemActive,
  type NavItem,
} from "@/components/nav-items";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { brokerEnvLabel } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { BrokerEnv, Health } from "@/types";

type MarketStatus = {
  label: string;
  value: string;
  isOpen: boolean | null;
};

const BROKER_ENV_COOKIE = "polaris_broker_env";
const BROKER_ENV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function ControlCenter({
  marketStatus,
  initialHealth,
  compact = false,
  className,
}: {
  marketStatus: MarketStatus;
  initialHealth?: Health | null;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(initialHealth ?? null);
  const [switchingEnv, setSwitchingEnv] = useState<BrokerEnv | null>(null);
  const [pendingLive, setPendingLive] = useState(false);
  const [liveConfirmation, setLiveConfirmation] = useState("");
  const [modeError, setModeError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useI18n();

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    api
      .health()
      .then((nextHealth) => {
        if (!cancelled) setHealth(nextHealth);
      })
      .catch(() => {
        if (!cancelled) setModeError(t.shell.tradingModeLoadError);
      });

    return () => {
      cancelled = true;
    };
  }, [open, t.shell.tradingModeLoadError]);

  async function switchBrokerEnv(nextMode: BrokerEnv) {
    setModeError(null);
    if (nextMode === "live" && liveConfirmation !== "LIVE") {
      setPendingLive(true);
      setModeError(t.shell.liveModeConfirmationError);
      return;
    }

    setSwitchingEnv(nextMode);
    try {
      setBrokerEnvCookie(nextMode);
      const nextHealth = await api.health();
      setHealth({ ...nextHealth, broker_env: nextMode });
      setPendingLive(false);
      setLiveConfirmation("");
      router.refresh();
    } catch (exc) {
      setModeError(
        exc instanceof Error ? exc.message : t.shell.tradingModeSwitchError
      );
    } finally {
      setSwitchingEnv(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon-sm" : "sm"}
        className={className}
        aria-label={t.shell.openControlCenter}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal data-icon={compact ? undefined : "inline-start"} />
        {!compact && <span>{t.nav.controlCenter}</span>}
      </Button>
      <DialogContent className="top-0 right-0 left-auto h-dvh w-full max-w-full translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-y-0 border-r-0 bg-card p-0 shadow-[-16px_0_48px_rgba(15,23,42,0.14)] sm:w-[22.5rem] sm:max-w-[22.5rem] data-open:slide-in-from-right-8 data-open:zoom-in-100 data-closed:slide-out-to-right-8 data-closed:zoom-out-100">
        <DialogHeader className="border-b px-4 py-4 pr-12">
          <DialogTitle>{t.nav.controlCenter}</DialogTitle>
          <DialogDescription>{t.shell.controlCenterDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          <ControlCenterSection
            icon={CircleGauge}
            title={t.shell.sessionTitle}
            description={t.shell.sessionDescription}
          >
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/70 px-3 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {marketStatus.label}
                </span>
                <MarketSessionBadge
                  label={marketStatus.label}
                  value={marketStatus.value}
                  isOpen={marketStatus.isOpen}
                  compact
                />
              </div>
              <div
                className={cn(
                  "grid gap-3 rounded-lg border bg-background/70 p-3",
                  health?.broker_env === "live" &&
                    "border-destructive/40 bg-destructive/5"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {t.shell.tradingModeTitle}
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {t.shell.tradingModeDescription}
                    </p>
                  </div>
                  <Badge
                    variant={health?.broker_env === "live" ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {brokerEnvLabel(health?.broker_env, locale)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={health?.broker_env === "paper" ? "default" : "outline"}
                    size="sm"
                    disabled={switchingEnv !== null || health?.broker_env === "paper"}
                    onClick={() => switchBrokerEnv("paper")}
                  >
                    {switchingEnv === "paper"
                      ? t.shell.tradingModeSwitching
                      : t.shell.switchToPaperTrading}
                  </Button>
                  <Button
                    type="button"
                    variant={health?.broker_env === "live" ? "destructive" : "outline"}
                    size="sm"
                    disabled={switchingEnv !== null || health?.broker_env === "live"}
                    onClick={() => setPendingLive(true)}
                  >
                    {t.shell.switchToLiveTrading}
                  </Button>
                </div>
                {pendingLive && health?.broker_env !== "live" && (
                  <div className="grid gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                    <p className="text-xs leading-5 text-destructive">
                      {t.shell.liveModeWarning}
                    </p>
                    <label className="grid gap-1.5 text-xs font-medium">
                      {t.shell.liveModeConfirmationLabel}
                      <input
                        value={liveConfirmation}
                        onChange={(event) => setLiveConfirmation(event.target.value)}
                        placeholder={t.shell.liveModeConfirmationPlaceholder}
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={switchingEnv !== null}
                        onClick={() => switchBrokerEnv("live")}
                      >
                        {switchingEnv === "live"
                          ? t.shell.tradingModeSwitching
                          : t.shell.confirmLiveTrading}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={switchingEnv !== null}
                        onClick={() => {
                          setPendingLive(false);
                          setLiveConfirmation("");
                          setModeError(null);
                        }}
                      >
                        {t.common.cancel}
                      </Button>
                    </div>
                  </div>
                )}
                {modeError && (
                  <p className="text-xs leading-5 text-destructive">{modeError}</p>
                )}
              </div>
            </div>
          </ControlCenterSection>

          <ControlCenterSection
            icon={Settings2}
            title={t.shell.preferencesTitle}
            description={t.shell.preferencesDescription}
          >
            <div className="grid gap-2">
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-background/70 px-3 py-2">
                <span className="text-sm font-medium">{t.theme.label}</span>
                <ThemeToggle variant="ghost" size="icon-sm" />
              </div>
              <div className="rounded-lg border bg-background/70 p-2">
                <div className="mb-2 text-sm font-medium">{t.language.label}</div>
                <LanguageToggle className="w-full" itemClassName="flex-1" />
              </div>
            </div>
          </ControlCenterSection>

          <ControlCenterSection
            icon={ArrowUpRight}
            title={t.shell.operationsTitle}
            description={t.shell.operationsDescription}
          >
            <div className="grid gap-2">
              {CONTROL_CENTER_NAV_ITEMS.map((item) => (
                <OperationLinkCard
                  key={item.href}
                  item={item}
                  active={isNavItemActive(pathname, item.href)}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          </ControlCenterSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ControlCenterSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function OperationLinkCard({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  const description = operationDescription(item.labelKey, t.shell);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-lg border bg-background/70 p-3 text-sm transition-colors hover:bg-muted",
        active && "border-primary/35 bg-primary/10 text-primary"
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground group-hover:text-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t.nav[item.labelKey]}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowUpRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}

function operationDescription(
  labelKey: NavItem["labelKey"],
  labels: {
    historyDescription: string;
    marketDescription: string;
    dataDescription: string;
    analysisDescription: string;
  }
) {
  if (labelKey === "history") return labels.historyDescription;
  if (labelKey === "market") return labels.marketDescription;
  if (labelKey === "analysis") return labels.analysisDescription;
  return labels.dataDescription;
}

function setBrokerEnvCookie(env: BrokerEnv) {
  document.cookie = [
    `${BROKER_ENV_COOKIE}=${env}`,
    "path=/",
    `max-age=${BROKER_ENV_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}
