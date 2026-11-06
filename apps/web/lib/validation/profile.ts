const DISPLAY_MIN = 2;
const DISPLAY_MAX = 80;
const BIO_MAX = 500;
const AVATAR_URL_MAX = 2000;

export type ProfileFieldErrors = {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
};

export function validateDisplayName(value: string): string | null {
  const t = value.trim();
  if (t.length < DISPLAY_MIN) {
    return `Display name must be at least ${DISPLAY_MIN} characters`;
  }
  if (t.length > DISPLAY_MAX) {
    return `Display name must be at most ${DISPLAY_MAX} characters`;
  }
  return null;
}

export function validateBio(value: string | null | undefined): string | null {
  if (value == null || value === "") {
    return null;
  }
  if (value.length > BIO_MAX) {
    return `Bio must be at most ${BIO_MAX} characters`;
  }
  return null;
}

export function validateAvatarUrl(
  value: string | null | undefined,
): string | null {
  if (value == null || value === "") {
    return null;
  }
  const t = value.trim();
  if (t.length > AVATAR_URL_MAX) {
    return "Avatar URL is too long";
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return "Avatar URL must be http or https";
    }
  } catch {
    return "Enter a valid avatar URL";
  }
  return null;
}

export function validateProfileForm(input: {
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
}): ProfileFieldErrors | null {
  const errors: ProfileFieldErrors = {};
  const dn = validateDisplayName(input.displayName);
  if (dn) {
    errors.displayName = dn;
  }
  const bio = validateBio(input.bio);
  if (bio) {
    errors.bio = bio;
  }
  const avatar = validateAvatarUrl(input.avatarUrl);
  if (avatar) {
    errors.avatarUrl = avatar;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
