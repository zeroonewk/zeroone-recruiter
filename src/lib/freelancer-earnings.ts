// Wspolna logika wynagrodzenia freelancera — jedno zrodlo prawdy dla:
// widoku freelancera, zamykania projektu (freelancer_payouts) i sekcji admina.
// Liczone osobno dla kazdego freelancera w kazdym projekcie.
//
// ZASADA:
// - >= 1 kandydat 'selected': amount = liczba 'selected' x wartosc projektu
//   (CV i spotkania tego freelancera w tym projekcie nie dodaja nic)
// - brak 'selected': amount = (stage1+stage2+selected) x cv_rate + (stage2+selected) x meeting_rate
//   (w praktyce: liczba stage1+stage2 x cv_rate + liczba stage2 x meeting_rate)
// - wartosc projektu = project_value, a gdy brak (null): projects.points
// Stawka 0 jest poprawna — fallback tylko dla brakujacej wartosci (null/undefined/nie-liczba).

export type CandidateStatus = 'submitted' | 'stage1' | 'stage2' | 'selected';

export type FreelancerRates = {
  cv_rate: number;
  meeting_rate: number;
  project_value: number | null;
};

export type FreelancerEarnings = {
  amount: number;
  mode: 'selected' | 'stages';
  selectedCount: number;
  stage1Count: number; // kandydaci, ktorzy przeszli Etap 1 (stage1, stage2, selected)
  stage2Count: number; // kandydaci, ktorzy przeszli Etap 2 (stage2, selected)
  effectiveValue: number;
};

function rateOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

// Normalizacja freelancer_rates z bazy (jsonb). Brak cv_rate / meeting_rate => 0,
// brak project_value => null (wtedy wartosc projektu = points). 0 zostaje 0.
export function normalizeRates(raw: unknown): FreelancerRates {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    cv_rate: rateOrNull(r.cv_rate) ?? 0,
    meeting_rate: rateOrNull(r.meeting_rate) ?? 0,
    project_value: rateOrNull(r.project_value),
  };
}

export function effectiveProjectValue(rates: FreelancerRates, points: number | null | undefined): number {
  if (typeof rates.project_value === 'number') return rates.project_value;
  return typeof points === 'number' && Number.isFinite(points) ? points : 0;
}

export function calcFreelancerEarnings({
  rates,
  points,
  candidates,
}: {
  rates: FreelancerRates;
  points: number | null | undefined;
  candidates: { status: string }[];
}): FreelancerEarnings {
  const effectiveValue = effectiveProjectValue(rates, points);
  const selectedCount = candidates.filter((c) => c.status === 'selected').length;
  const stage1Count = candidates.filter(
    (c) => c.status === 'stage1' || c.status === 'stage2' || c.status === 'selected'
  ).length;
  const stage2Count = candidates.filter((c) => c.status === 'stage2' || c.status === 'selected').length;

  if (selectedCount > 0) {
    return {
      amount: selectedCount * effectiveValue,
      mode: 'selected',
      selectedCount,
      stage1Count,
      stage2Count,
      effectiveValue,
    };
  }

  return {
    amount: stage1Count * rates.cv_rate + stage2Count * rates.meeting_rate,
    mode: 'stages',
    selectedCount,
    stage1Count,
    stage2Count,
    effectiveValue,
  };
}
