type ClerkEmailAddress = {
  id: string;
  email_address: string;
};

export type ClerkUserWebhookData = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
  updated_at?: number;
  created_at?: number;
};

export function normalizeClerkUser(data: ClerkUserWebhookData) {
  const primaryEmail =
    data.email_addresses?.find(
      (email) => email.id === data.primary_email_address_id
    ) ?? data.email_addresses?.[0];
  const fullName = [data.first_name, data.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    clerkUserId: data.id,
    email: primaryEmail?.email_address,
    name: fullName || data.username || primaryEmail?.email_address,
    imageUrl: data.image_url ?? undefined,
    sourceUpdatedAt: data.updated_at ?? data.created_at,
  };
}
