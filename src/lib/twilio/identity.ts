export function buildVoiceIdentity(
  accountId: string,
  userId: string,
) {
  const cleanAccountId = accountId.replace(
    /[^a-zA-Z0-9_]/g,
    '_',
  );

  const cleanUserId = userId.replace(
    /[^a-zA-Z0-9_]/g,
    '_',
  );

  return `account_${cleanAccountId}_user_${cleanUserId}`;
}