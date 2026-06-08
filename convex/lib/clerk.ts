import { verifyWebhook } from "@clerk/backend/webhooks";

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

export type ClerkOrganizationWebhookData = {
  id: string;
  name?: string | null;
  slug?: string | null;
  image_url?: string | null;
  updated_at?: number;
  created_at?: number;
};

export type ClerkOrganizationMembershipWebhookData = {
  id: string;
  role?: string | null;
  organization?: ClerkOrganizationWebhookData | null;
  organization_id?: string | null;
  public_user_data?: {
    user_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    identifier?: string | null;
  } | null;
  user_id?: string | null;
  updated_at?: number;
  created_at?: number;
};

export class ClerkWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClerkWebhookPayloadError";
  }
}

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

export function normalizeClerkOrganization(data: ClerkOrganizationWebhookData) {
  return {
    clerkOrganizationId: data.id,
    name: data.name ?? data.slug ?? data.id,
    slug: data.slug ?? undefined,
    imageUrl: data.image_url ?? undefined,
    sourceUpdatedAt: data.updated_at ?? data.created_at,
  };
}

export function normalizeClerkPublicUserFromMembership(
  data: ClerkOrganizationMembershipWebhookData
) {
  const publicUser = data.public_user_data;
  const clerkUserId = publicUser?.user_id ?? data.user_id ?? undefined;

  if (!clerkUserId) {
    return null;
  }

  const identifier = publicUser?.identifier ?? undefined;
  const fullName = [publicUser?.first_name, publicUser?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    clerkUserId,
    email: identifier?.includes("@") ? identifier : undefined,
    name: fullName || identifier,
    imageUrl: publicUser?.image_url ?? undefined,
    sourceUpdatedAt: data.updated_at ?? data.created_at,
  };
}

export function normalizeClerkOrganizationFromMembership(
  data: ClerkOrganizationMembershipWebhookData
) {
  return data.organization ? normalizeClerkOrganization(data.organization) : null;
}

export function normalizeClerkOrganizationMembership(
  data: ClerkOrganizationMembershipWebhookData
) {
  const clerkOrganizationId =
    data.organization?.id ?? data.organization_id ?? undefined;
  const clerkUserId =
    data.public_user_data?.user_id ?? data.user_id ?? undefined;

  if (!clerkOrganizationId) {
    throw new ClerkWebhookPayloadError(
      "Organization membership payload is missing an organization id."
    );
  }

  if (!clerkUserId) {
    throw new ClerkWebhookPayloadError(
      "Organization membership payload is missing a user id."
    );
  }

  return {
    clerkOrganizationMembershipId: data.id,
    clerkOrganizationId,
    clerkUserId,
    rawRole: data.role ?? "org:member",
    sourceUpdatedAt: data.updated_at ?? data.created_at,
  };
}

export async function verifyClerkWebhookRequest(
  request: Request,
  signingSecret: string
) {
  return await verifyWebhook(request, { signingSecret });
}
