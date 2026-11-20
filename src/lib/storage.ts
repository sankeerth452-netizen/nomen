// How much of the database Nomen is using, for admins: the keyword lists and the photos are what grow.
import { db } from "./db";

export type StorageUse = { totalMb: number; keywordsMb: number; photosMb: number };

export async function storageUse(): Promise<StorageUse> {
  const [row] = await db.$queryRaw<{ total: bigint; keywords: bigint; photos: bigint }[]>`
    SELECT pg_database_size(current_database()) AS total,
           pg_total_relation_size('"Keyword"') AS keywords,
           pg_total_relation_size('"BatchItem"') + pg_total_relation_size('"GenerationPhoto"') AS photos`;
  const mb = (b: bigint) => Math.round(Number(b) / 1_048_576);
  return { totalMb: mb(row.total), keywordsMb: mb(row.keywords), photosMb: mb(row.photos) };
}
