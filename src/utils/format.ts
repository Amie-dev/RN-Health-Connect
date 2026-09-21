/**
 * Shared formatting helpers.
 *
 * The old dashboard had two near-identical payload formatters (one for local
 * records, one for live Health Connect records). Both are replaced by
 * {@link formatRecordSummary}, which works on either shape.
 */

/** Health Connect returns either a raw number or a nested `<unit>Result` object. */
function firstNumber(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function round(value: number, digits = 1): string {
  const factor = 10 ** digits;
  return (Math.round(value * factor) / factor).toString();
}

/** Duration in minutes between two ISO timestamps (null when not derivable). */
export function durationMinutes(startTime?: string, endTime?: string): number | null {
  if (!startTime || !endTime) return null;
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

/** `95m` / `3h 12m` style duration label. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/** Clock time, e.g. `14:05`. Returns an em dash for invalid input. */
export function formatClock(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Full date + time, e.g. `21 Sep, 14:05`. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Short relative age, e.g. `just now`, `12m ago`, `3h ago`, `2d ago`. */
export function formatRelative(iso?: string | null): string {
  if (!iso) return '—';
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '—';

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Pretty JSON, bounded so a huge sleep/nutrition payload cannot stall a row. */
export function formatPayloadJson(payload: unknown, maxLength = 1200): string {
  try {
    const json = JSON.stringify(payload, null, 2) ?? '';
    return json.length > maxLength ? `${json.slice(0, maxLength)}\n… truncated` : json;
  } catch {
    return 'Unserializable payload';
  }
}

/**
 * One-line human summary of a health record, e.g. `8,231 steps`, `72.4 kg`,
 * `118 / 76 mmHg`. Works for both locally cached payloads and live reads.
 */
export function formatRecordSummary(recordType: string, payload: any): string {
  if (!payload) return 'No payload';

  switch (recordType) {
    case 'Steps': {
      const count = firstNumber(payload.count, payload.records?.[0]?.count);
      return count != null ? `${Math.round(count).toLocaleString()} steps` : 'Steps';
    }
    case 'Weight': {
      const kg = firstNumber(payload.weight?.inKilograms, payload.weight?.value);
      return kg != null ? `${round(kg)} kg` : 'Weight';
    }
    case 'Height': {
      const meters = firstNumber(payload.height?.inMeters, payload.height?.value);
      if (meters == null) return 'Height';
      return meters < 3 ? `${round(meters * 100)} cm` : `${round(meters)} m`;
    }
    case 'HeartRate': {
      const bpm = firstNumber(
        payload.samples?.[0]?.beatsPerMinute,
        payload.beatsPerMinute,
        payload.bpm
      );
      if (bpm == null) return 'Heart rate';
      const sampleCount = Array.isArray(payload.samples) ? payload.samples.length : 0;
      return sampleCount > 1
        ? `${Math.round(bpm)} bpm · ${sampleCount} samples`
        : `${Math.round(bpm)} bpm`;
    }
    case 'BloodPressure': {
      const systolic = firstNumber(
        payload.systolic?.inMillimetersOfMercury,
        payload.systolic?.value,
        payload.systolic
      );
      const diastolic = firstNumber(
        payload.diastolic?.inMillimetersOfMercury,
        payload.diastolic?.value,
        payload.diastolic
      );
      if (systolic == null || diastolic == null) return 'Blood pressure';
      return `${Math.round(systolic)} / ${Math.round(diastolic)} mmHg`;
    }
    case 'Hydration': {
      const liters = firstNumber(payload.volume?.inLiters, payload.volume?.value);
      return liters != null ? `${round(liters, 2)} L` : 'Hydration';
    }
    case 'ActiveCaloriesBurned':
    case 'TotalCaloriesBurned': {
      const kcal = firstNumber(
        payload.energy?.inKilocalories,
        payload.energy?.inCalories,
        payload.energy?.value,
        payload.energy
      );
      return kcal != null ? `${Math.round(kcal).toLocaleString()} kcal` : 'Calories';
    }
    case 'Distance': {
      const km = firstNumber(
        payload.distance?.inKilometers,
        payload.distance?.value,
        payload.distance
      );
      return km != null ? `${round(km, 2)} km` : 'Distance';
    }
    case 'BloodGlucose': {
      const mmol = firstNumber(
        payload.level?.inMillimolesPerLiter,
        payload.level?.value,
        payload.level
      );
      return mmol != null ? `${round(mmol, 2)} mmol/L` : 'Blood glucose';
    }
    case 'OxygenSaturation': {
      const percent = firstNumber(payload.percentage, payload.oxygenSaturation?.value);
      return percent != null ? `${round(percent)} %` : 'Oxygen saturation';
    }
    case 'BodyTemperature': {
      const celsius = firstNumber(
        payload.temperature?.inCelsius,
        payload.temperature?.value,
        payload.temperature
      );
      return celsius != null ? `${round(celsius)} °C` : 'Body temperature';
    }
    case 'BodyFat': {
      const percent = firstNumber(payload.percentage, payload.bodyFat?.value);
      return percent != null ? `${round(percent)} %` : 'Body fat';
    }
    case 'SleepSession': {
      const minutes = durationMinutes(payload.startTime, payload.endTime);
      const title = payload.title || 'Sleep';
      return minutes != null ? `${title} · ${formatDuration(minutes)}` : title;
    }
    case 'ExerciseSession': {
      const minutes = durationMinutes(payload.startTime, payload.endTime);
      const title = payload.title || 'Exercise';
      return minutes != null ? `${title} · ${formatDuration(minutes)}` : title;
    }
    case 'Nutrition': {
      const kcal = firstNumber(
        payload.energy?.inKilocalories,
        payload.energy?.value,
        payload.energy
      );
      const name = payload.name || 'Nutrition';
      return kcal != null ? `${name} · ${Math.round(kcal)} kcal` : name;
    }
    default:
      return 'Record';
  }
}

