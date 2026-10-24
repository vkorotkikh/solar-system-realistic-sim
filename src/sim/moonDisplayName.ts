/** Runtime display only; raw source names still own IDs, physical lookups and fit keys. */
export function moonDisplayName(source: { planet: string; iauCode: unknown; name: string }): string {
  return source.planet === 'Jupiter' && source.iauCode === '519' ? 'Megaclite' : source.name;
}
