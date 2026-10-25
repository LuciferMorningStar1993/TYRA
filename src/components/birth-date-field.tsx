import { DateField } from '@/components/date-field';
import { MIN_BIRTH_DATE } from '@/lib/onboarding';

const DEFAULT_BIRTH_DATE = new Date(1990, 0, 1);

export type BirthDateFieldProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string | null;
};

/** Fecha de nacimiento (selector nativo o <input type="date"> en web, vía DateField). */
export function BirthDateField({ value, onChange, error }: BirthDateFieldProps) {
  return (
    <DateField
      label="Fecha de nacimiento"
      value={value}
      onChange={onChange}
      minimumDate={MIN_BIRTH_DATE}
      maximumDate={new Date()}
      initialPickerDate={DEFAULT_BIRTH_DATE}
      error={error}
    />
  );
}
