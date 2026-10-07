"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreditCard, ExternalLink, Link2, SlidersHorizontal, User, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FormBanner, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SaveBar, SettingsSection } from "./settings-section";
import { FileDropzone } from "./file-dropzone";
import { TimezoneSelect } from "./timezone-select";
import { CopyButton } from "@/components/shared/copy-button";
import { updateTutorSettingsAction } from "@/lib/actions/tutor";
import type { ActionState } from "@/lib/actions/helpers";

export interface TutorSettingsValues {
  fullName: string; avatarUrl: string | null; slug: string; headline: string; bio: string; subjects: string;
  hourlyPrice: number; currency: string; durations: number[]; timezone: string; introVideoUrl: string;
  trialEnabled: boolean; trialDurationMin: number; cancelFreeHours: number; rescheduleFreeHours: number; minNoticeHours: number; bufferMin: number;
  currencyLocked: boolean; stripeAccountId: string | null; stripeConnected: boolean;
}

const initial: ActionState = {};

export function TutorSettingsForm({ v }: { v: TutorSettingsValues }) {
  const [state, action, pending] = useActionState(updateTutorSettingsAction, initial);
  const { toast } = useToast();
  const [avatar, setAvatar] = useState("");
  const [dirty, setDirty] = useState(false);
  const [resetKey, setResetKey] = useState(0); // bumping it remounts the fields at their saved values
  const shown = useRef(state);
  const err = state.fieldErrors ?? {};

  // Toast on every successful save, and the form is clean again
  useEffect(() => {
    if (state !== shown.current && state.ok) {
      toast({ kind: "success", title: "Settings saved" });
      const t = setTimeout(() => setDirty(false), 0);
      shown.current = state;
      return () => clearTimeout(t);
    }
    shown.current = state;
  }, [state, toast]);

  function discard() {
    setResetKey((k) => k + 1);
    setAvatar("");
    setDirty(false);
  }

  return (
    <form action={action} onChange={() => setDirty(true)} onClick={(e) => { if ((e.target as HTMLElement).closest("[role=switch]")) setDirty(true); }} className="space-y-6" noValidate>
      <FormBanner error={state.error} />

      <div key={resetKey} className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start [&>*]:min-w-0">
        {/* Left column: who you are */}
        <div className="space-y-6">
          <SettingsSection icon={User} tone="pink" title="Profile details" description="Your public presentation to prospective students." aside={<Badge variant="brand">Public</Badge>}>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={v.fullName} src={avatar ? `/api/files/${avatar}` : v.avatarUrl} size="xl" />
              <div className="min-w-0 flex-1 basis-56"><FileDropzone kind="avatar" multiple={false} accept="image/*" label="Change photo" hint="PNG or JPG" onUploaded={(f) => { setAvatar(f.path); setDirty(true); }} /></div>
            </div>
            <input type="hidden" name="avatarPath" value={avatar} />
            <TextField label="Full name" name="fullName" defaultValue={v.fullName} error={err.fullName} />
            <TextField label="Headline" name="headline" defaultValue={v.headline} error={err.headline} hint="Appears right below your name on your booking page." />
            <TextAreaField label="About you" name="bio" defaultValue={v.bio} rows={6} error={err.bio} />
          </SettingsSection>

          <SettingsSection icon={VideoIcon} tone="violet" title="Subjects & video intro" description="What you teach and a short video to introduce yourself.">
            <TextField label="Subjects or languages" name="subjects" defaultValue={v.subjects} hint="Separate with commas" error={err.subjects} />
            <TextField label="Intro video link" name="introVideoUrl" type="url" defaultValue={v.introVideoUrl} placeholder="https://youtube.com/…" error={err.introVideoUrl} />
            <TimezoneSelect defaultValue={v.timezone} error={err.timezone} />
          </SettingsSection>
        </div>

        {/* Right column: how students book and pay */}
        <div className="space-y-6">
          <SettingsSection icon={Link2} tone="pink" title="Booking page address" description="Share your direct booking link anywhere.">
            <TextField label="Page address" name="slug" defaultValue={v.slug} error={err.slug} hint={`Your link: /t/${v.slug}`} />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={`/t/${v.slug}`} />
              <Button asChild variant="outline" size="sm"><Link href={`/t/${v.slug}`}><ExternalLink className="size-4" aria-hidden /> Preview public page</Link></Button>
            </div>
          </SettingsSection>

          <SettingsSection icon={SlidersHorizontal} tone="peach" title="Lesson policies" description="Pricing, durations and the rules we enforce for you.">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Lesson lengths</legend>
              <div className="flex flex-wrap gap-3">
                {[30, 45, 60].map((m) => (
                  <label key={m} className="mono flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-border bg-card px-4 py-2.5 font-bold transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/40">
                    <input type="checkbox" name="durations" value={m} defaultChecked={v.durations.includes(m)} className="size-4 accent-brand-600" />
                    {m} min
                  </label>
                ))}
              </div>
              {err.durations && <p role="alert" className="mt-1 text-sm font-medium text-danger">⚠ {err.durations}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Hourly price" name="hourlyPrice" type="number" step="0.5" min={1} defaultValue={v.hourlyPrice} error={err.hourlyPrice} />
              <div>
                <SelectField label="Currency" name="currency" defaultValue={v.currency} disabled={v.currencyLocked} error={err.currency} hint={v.currencyLocked ? "Locked because you have packages priced in this currency." : undefined} options={[{ value: "eur", label: "Euro (€)" }, { value: "usd", label: "US dollar ($)" }, { value: "gbp", label: "Pound (£)" }]} />
                {v.currencyLocked && <input type="hidden" name="currency" value={v.currency} />}
              </div>
            </div>
            <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4">
              <Switch name="trialEnabled" label="Offer a free trial lesson" description="Each student can book one trial with you." defaultChecked={v.trialEnabled} />
              <SelectField label="Trial lesson length" name="trialDurationMin" defaultValue={String(v.trialDurationMin)} options={[15, 20, 30, 45].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
            </div>
            <p className="text-sm text-muted-foreground">Cancellation and reschedule windows are enforced automatically: students cannot cancel or move a lesson inside them.</p>
            <SelectField label="Buffer between lessons" name="bufferMin" defaultValue={String(v.bufferMin)} hint="Time kept free after each lesson, so students can't book back-to-back." options={[0, 5, 10, 15, 30, 45, 60].map((m) => ({ value: String(m), label: m === 0 ? "No buffer" : `${m} minutes` }))} error={err.bufferMin} />
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <TextField label="Free cancellation (hours before)" name="cancelFreeHours" type="number" min={0} max={168} defaultValue={v.cancelFreeHours} error={err.cancelFreeHours} />
              <TextField label="Free reschedule (hours before)" name="rescheduleFreeHours" type="number" min={0} max={168} defaultValue={v.rescheduleFreeHours} error={err.rescheduleFreeHours} />
              <TextField label="Minimum notice (hours)" name="minNoticeHours" type="number" min={0} max={168} defaultValue={v.minNoticeHours} error={err.minNoticeHours} />
            </div>
          </SettingsSection>

          <SettingsSection id="payments" icon={CreditCard} tone="green" title="Payouts & Stripe" description="Student payments go straight to your own Stripe account."
            aside={v.stripeConnected ? <Badge variant="success">Connected</Badge> : <Badge variant="warning">{v.stripeAccountId ? "Setup unfinished" : "Not connected"}</Badge>}>
            <p className="text-sm text-muted-foreground">
              {v.stripeConnected
                ? "Stripe pays your earnings out to your bank. TutorHub takes no commission and never holds your money. Refunds come out of your Stripe balance."
                : "Connect a Stripe account so students can pay you by card. You add your identity and bank details on Stripe's own secure pages (about 5 minutes). Until then, students can only book free trials or use lesson credits."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant={v.stripeConnected ? "outline" : "primary"} size="sm"><a href="/api/stripe/connect">{v.stripeConnected ? "Update Stripe details" : v.stripeAccountId ? "Continue setup" : "Connect Stripe"}</a></Button>
              {v.stripeAccountId && <Button asChild variant="outline" size="sm"><a href="/api/stripe/dashboard">Open my Stripe dashboard <ExternalLink className="size-4" aria-hidden /></a></Button>}
            </div>
          </SettingsSection>
        </div>
      </div>

      <SaveBar dirty={dirty} pending={pending} onDiscard={discard} />
    </form>
  );
}
