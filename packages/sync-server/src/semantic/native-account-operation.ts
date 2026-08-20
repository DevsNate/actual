export type NativeUnlinkedCheckingAccountBody = {
  name: string;
  openingBalance: number;
  openingDate: string;
};

export function parseNativeUnlinkedCheckingAccountBody(
  value: unknown,
): NativeUnlinkedCheckingAccountBody | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.type !== 'checking' ||
    !Number.isSafeInteger(value.openingBalance) ||
    typeof value.openingDate !== 'string'
  ) {
    return null;
  }
  return {
    name: value.name.trim(),
    openingBalance: Number(value.openingBalance),
    openingDate: value.openingDate,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
