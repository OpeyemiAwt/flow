import { disconnectPrismaClients, getPrismaClient } from "../src/foundation/prisma.ts";
import { dispatchBlogNewsletterToSubscribers } from "../src/server/email/flow-email.ts";

async function main(): Promise<void> {
  const slug = process.argv[2]?.trim() || undefined;
  const db = getPrismaClient("custody");
  try {
    const result = await dispatchBlogNewsletterToSubscribers(db, slug);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await disconnectPrismaClients();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
