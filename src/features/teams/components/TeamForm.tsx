"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const teamFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  shortName: z.string().max(6, "Short name must be 6 characters or fewer").optional(),
  city: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  description: z.string().max(1000).optional(),
  logoUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  bannerUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
});

export type TeamFormValues = z.infer<typeof teamFormSchema>;

interface TeamFormProps {
  /** Pre-fill from an existing team for the edit path. */
  defaultValues?: Partial<TeamFormValues>;
  onSubmit: (values: TeamFormValues) => Promise<void>;
  submitLabel?: string;
  isLoading?: boolean;
}

/**
 * TeamForm — shared controlled form for create and edit team.
 *
 * The caller is responsible for the server action call; this component only
 * validates, calls onSubmit with clean values and shows a loading state.
 */
export function TeamForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  isLoading,
}: TeamFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      shortName: "",
      city: "",
      country: "",
      description: "",
      logoUrl: "",
      bannerUrl: "",
      ...defaultValues,
    },
  });

  const busy = isSubmitting || isLoading;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
    >
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">
          Team name <span className="text-destructive" aria-hidden="true">*</span>
        </Label>
        <Input
          id="name"
          placeholder="e.g. Mumbai Mavericks"
          {...register("name")}
          aria-invalid={!!errors.name}
          disabled={busy}
        />
        {errors.name && (
          <p role="alert" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Short name */}
      <div className="space-y-1.5">
        <Label htmlFor="shortName">Short name (≤ 6 chars)</Label>
        <Input
          id="shortName"
          placeholder="e.g. MUM"
          maxLength={6}
          {...register("shortName")}
          aria-invalid={!!errors.shortName}
          disabled={busy}
        />
        {errors.shortName && (
          <p role="alert" className="text-xs text-destructive">
            {errors.shortName.message}
          </p>
        )}
      </div>

      {/* City / Country */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            placeholder="e.g. Mumbai"
            {...register("city")}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            placeholder="e.g. India"
            {...register("country")}
            disabled={busy}
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={3}
          placeholder="Tell players about your team…"
          {...register("description")}
          disabled={busy}
          className={cn(
            "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          )}
        />
        {errors.description && (
          <p role="alert" className="text-xs text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Logo URL */}
      <div className="space-y-1.5">
        <Label htmlFor="logoUrl">Logo URL</Label>
        <Input
          id="logoUrl"
          type="url"
          placeholder="https://..."
          {...register("logoUrl")}
          aria-invalid={!!errors.logoUrl}
          disabled={busy}
        />
        {errors.logoUrl && (
          <p role="alert" className="text-xs text-destructive">
            {errors.logoUrl.message}
          </p>
        )}
      </div>

      {/* Banner URL */}
      <div className="space-y-1.5">
        <Label htmlFor="bannerUrl">Banner URL</Label>
        <Input
          id="bannerUrl"
          type="url"
          placeholder="https://..."
          {...register("bannerUrl")}
          aria-invalid={!!errors.bannerUrl}
          disabled={busy}
        />
        {errors.bannerUrl && (
          <p role="alert" className="text-xs text-destructive">
            {errors.bannerUrl.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={busy}>
        {busy && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
