"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createTournamentAction,
  updateTournamentAction,
} from "@/server/actions/tournament";

// ─── Schema (mirrors the server schema) ──────────────────────────────────────

const formSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters.").max(120),
    format: z.enum([
      "league",
      "knockout",
      "round_robin",
      "league_playoffs",
    ] as const),
    matchFormat: z.enum([
      "T20",
      "ODI",
      "TEST",
      "T10",
      "THE_HUNDRED",
      "CUSTOM",
    ] as const),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    isPublic: z.boolean(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) {
        return d.endDate >= d.startDate;
      }
      return true;
    },
    { message: "End date must be on or after start date.", path: ["endDate"] },
  );

type FormValues = z.infer<typeof formSchema>;

interface TournamentFormProps {
  /** When provided, the form is in edit mode for this tournament. */
  tournamentId?: string;
  defaultValues?: Partial<FormValues>;
  className?: string;
}

const SELECT_CLS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/**
 * TournamentForm — shared create / edit form.
 *
 * Calls the appropriate server action then redirects on success. Surfaces
 * field-level validation errors returned by zod inline.
 */
export function TournamentForm({
  tournamentId,
  defaultValues,
  className,
}: TournamentFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      format: "league",
      matchFormat: "T20",
      isPublic: true,
      ...defaultValues,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      if (tournamentId) {
        const result = await updateTournamentAction({
          tournamentId,
          ...values,
          startDate: values.startDate || null,
          endDate: values.endDate || null,
        });
        if (!result.ok) {
          setServerError(result.error ?? "Failed to update tournament.");
          return;
        }
        router.push(`/tournaments/${tournamentId}`);
        router.refresh();
      } else {
        const result = await createTournamentAction({
          ...values,
          startDate: values.startDate || null,
          endDate: values.endDate || null,
        });
        if (!result.ok) {
          setServerError(result.error ?? "Failed to create tournament.");
          return;
        }
        const newId = result.data?.tournamentId;
        router.push(newId ? `/tournaments/${newId}` : "/tournaments");
        router.refresh();
      }
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "An error occurred.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("space-y-5", className)}
      noValidate
    >
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Tournament name</Label>
        <Input
          id="name"
          placeholder="e.g. Summer T20 Cup 2025"
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name")}
        />
        {errors.name && (
          <p id="name-error" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Format */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="format">Tournament format</Label>
          <select
            id="format"
            className={SELECT_CLS}
            aria-describedby={errors.format ? "format-error" : undefined}
            {...register("format")}
          >
            <option value="league">League</option>
            <option value="round_robin">Round Robin</option>
            <option value="knockout">Knockout</option>
            <option value="league_playoffs">League + Playoffs</option>
          </select>
          {errors.format && (
            <p id="format-error" className="text-xs text-destructive">
              {errors.format.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="matchFormat">Match format</Label>
          <select
            id="matchFormat"
            className={SELECT_CLS}
            aria-describedby={errors.matchFormat ? "matchFormat-error" : undefined}
            {...register("matchFormat")}
          >
            <option value="T20">T20</option>
            <option value="T10">T10</option>
            <option value="ODI">ODI</option>
            <option value="THE_HUNDRED">The Hundred</option>
            <option value="TEST">Test</option>
            <option value="CUSTOM">Custom</option>
          </select>
          {errors.matchFormat && (
            <p id="matchFormat-error" className="text-xs text-destructive">
              {errors.matchFormat.message}
            </p>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Start date (optional)</Label>
          <Input
            id="startDate"
            type="date"
            aria-describedby={errors.startDate ? "startDate-error" : undefined}
            {...register("startDate")}
          />
          {errors.startDate && (
            <p id="startDate-error" className="text-xs text-destructive">
              {errors.startDate.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="endDate">End date (optional)</Label>
          <Input
            id="endDate"
            type="date"
            aria-describedby={errors.endDate ? "endDate-error" : undefined}
            {...register("endDate")}
          />
          {errors.endDate && (
            <p id="endDate-error" className="text-xs text-destructive">
              {errors.endDate.message}
            </p>
          )}
        </div>
      </div>

      {/* Visibility */}
      <div className="flex items-center gap-2">
        <input
          id="isPublic"
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary"
          {...register("isPublic")}
        />
        <Label htmlFor="isPublic" className="cursor-pointer">
          Make this tournament publicly visible
        </Label>
      </div>

      {/* Server error */}
      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {tournamentId ? "Save changes" : "Create tournament"}
      </Button>
    </form>
  );
}
