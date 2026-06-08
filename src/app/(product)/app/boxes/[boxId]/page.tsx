import { BoxLookup } from "@/components/box-lookup";

export default async function BoxLookupPage({
  params,
  searchParams,
}: {
  params: Promise<{ boxId: string }>;
  searchParams: Promise<{ householdId?: string; moveId?: string }>;
}) {
  const [{ boxId }, query] = await Promise.all([params, searchParams]);

  return (
    <BoxLookup
      boxId={boxId}
      householdId={query.householdId}
      moveId={query.moveId}
    />
  );
}
