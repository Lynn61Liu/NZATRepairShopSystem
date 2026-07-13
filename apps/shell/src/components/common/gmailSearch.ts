export function getGmailPlateSearchUrl(plate?: string | null) {
  const query = plate?.trim();
  return query
    ? `https://mail.google.com/mail/u/0/?tab=rm&ogbl#search/${encodeURIComponent(query)}`
    : "";
}
