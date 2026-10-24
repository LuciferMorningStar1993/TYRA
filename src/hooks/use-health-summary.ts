import { healthSummary, type HealthSummary } from '@/lib/health';
import { toHealthProfile } from '@/lib/profile';
import { useSession } from '@/providers/session-provider';

export function useHealthSummary(): { summary: HealthSummary; weightKg: number } | null {
  const { profile } = useSession();
  const healthProfile = profile ? toHealthProfile(profile) : null;
  if (!healthProfile) return null;
  return { summary: healthSummary(healthProfile), weightKg: healthProfile.weightKg };
}
